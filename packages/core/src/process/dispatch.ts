import type { Bus } from '../bus.js';
import { createConsumeContext } from '../consume-context.js';
import type { Envelope } from '../envelope.js';
import { ConcurrencyError } from '../errors.js';
import type { Logger } from '../logger.js';
import type { Message, MessageHeaders } from '../message.js';
import type { ISagaStore, ProcessData } from '../persistence/saga-store.js';
import type { ITimeoutStore } from '../persistence/timeout-store.js';
import type { ConsumeResult } from '../transport.js';
import type { ProcessContext } from './handler.js';
import type { ProcessRegistry } from './registry.js';

export interface SagaBranchDeps {
  processes: ProcessRegistry;
  store: ISagaStore;
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
    const key = reg.handler.correlate(message as Message);
    const loaded = await deps.store.findByCorrelationId<ProcessData>(reg.dataType, key);

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
        token = await deps.store.insert<ProcessData>(reg.dataType, data);
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
        if (!deps.timeoutStore) {
          throw new Error('saga timeouts require a configured ITimeoutStore');
        }
        await deps.timeoutStore.schedule({
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
        await deps.store.delete(reg.dataType, key);
      } else {
        await deps.store.update<ProcessData>(reg.dataType, data, token);
      }
    } catch (err) {
      const wrapped = err instanceof Error ? err : new Error(String(err));
      return {
        ran: true,
        result: {
          success: false,
          notHandled: false,
          error: wrapped,
          terminalFailure: !(err instanceof ConcurrencyError),
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
