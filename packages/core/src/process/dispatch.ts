import type { Bus } from '../bus.js';
import { createConsumeContext } from '../consume-context.js';
import type { Envelope } from '../envelope.js';
import type { Logger } from '../logger.js';
import type { Message, MessageHeaders } from '../message.js';
import type { ISagaStore, ProcessData } from '../persistence/saga-store.js';
import type { ITimeoutStore } from '../persistence/timeout-store.js';
import type { ConsumeResult } from '../transport.js';
import type { ProcessContext } from './handler.js';
import type { ProcessRegistry } from './registry.js';

export interface SagaBranchDeps {
    processes: ProcessRegistry;
    // Fallback stores used only when a process registration does not carry its own. In production
    // every registration carries per-process stores (see ProcessRegistry); these exist so unit tests
    // can drive runSagaBranch with a single store.
    store?: ISagaStore;
    timeoutStore?: ITimeoutStore;
    bus: Bus;
    logger: Logger;
}

export interface SagaBranchOutcome {
    ran: boolean;
    result?: ConsumeResult;
}

export async function runSagaBranch(
    envelope: Envelope,
    message: object,
    signal: AbortSignal,
    deps: SagaBranchDeps,
): Promise<SagaBranchOutcome> {
    const headers = envelope.headers as MessageHeaders;
    const messageType = typeof headers.messageType === 'string' ? headers.messageType : '';
    const regs = deps.processes.registrationsFor(messageType);
    if (regs.length === 0) return { ran: false };

    let anyRan = false;
    for (const reg of regs) {
        // Resolve the stores for THIS process. Each registration carries its own; deps.* is only a
        // single-store fallback for unit tests that drive the branch directly.
        const store = reg.store ?? deps.store;
        if (!store) {
            throw new Error(`process '${reg.processName}' has no configured ISagaStore`);
        }
        const timeoutStore = reg.timeoutStore ?? deps.timeoutStore;

        const key = reg.handler.correlate(message as Message);
        const loaded = await store.findByCorrelationId<ProcessData>(reg.dataType, key);

        if (!loaded && !reg.isStart) {
            deps.logger.debug('saga branch: no saga found, skipping non-start registration', {
                processName: reg.processName,
                messageType,
                correlationId: key,
            });
            continue;
        }

        let token: string;
        let data: ProcessData;
        if (!loaded) {
            data = { correlationId: key } as ProcessData;
            try {
                token = await store.insert<ProcessData>(reg.dataType, data);
            } catch (err) {
                const wrapped = err instanceof Error ? err : new Error(String(err));
                return {
                    ran: true,
                    result: {
                        success: false,
                        notHandled: false,
                        error: wrapped,
                        terminalFailure: false,
                    },
                };
            }
        } else {
            data = loaded.data;
            token = loaded.concurrencyToken;
        }

        let markedComplete = false;
        const ctx: ProcessContext = {
            ...createConsumeContext({ bus: deps.bus, headers, signal, logger: deps.logger }),
            markComplete: () => {
                markedComplete = true;
            },
            requestTimeout: async (name, runAt, payload) => {
                if (!timeoutStore) {
                    throw new Error('saga timeouts require a configured ITimeoutStore');
                }
                await timeoutStore.schedule({
                    name,
                    sagaCorrelationId: key,
                    sagaDataType: reg.dataType,
                    runAt,
                    payload,
                });
            },
        };

        try {
            await reg.handler.handle(message as Message, data, ctx);
        } catch (err) {
            const wrapped = err instanceof Error ? err : new Error(String(err));
            return {
                ran: true,
                result: {
                    success: false,
                    notHandled: false,
                    error: wrapped,
                    terminalFailure: false,
                },
            };
        }

        try {
            if (markedComplete) {
                await store.delete(reg.dataType, key);
            } else {
                await store.update<ProcessData>(reg.dataType, data, token);
            }
        } catch (err) {
            const wrapped = err instanceof Error ? err : new Error(String(err));
            // A post-handler persistence failure (a transient store/network error, or an optimistic
            // ConcurrencyError) is infrastructure: it must be retried by the normal retry policy, not
            // dead-lettered with zero retries. Only genuine poison messages (deserialization/validation)
            // are terminal, and the saga branch never produces those.
            return {
                ran: true,
                result: {
                    success: false,
                    notHandled: false,
                    error: wrapped,
                    terminalFailure: false,
                },
            };
        }

        anyRan = true;
    }

    return {
        ran: true,
        result: { success: true, notHandled: !anyRan, terminalFailure: false },
    };
}
