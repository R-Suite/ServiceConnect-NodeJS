import { InvalidOperationError } from '../errors.js';
import type { Message } from '../message.js';
import type { ISagaStore, ProcessData } from '../persistence/saga-store.js';
import type { ITimeoutStore } from '../persistence/timeout-store.js';
import type { ProcessHandler } from './handler.js';

export interface ProcessRegistration {
    readonly processName: string;
    readonly dataType: string;
    readonly messageType: string;
    readonly isStart: boolean;
    readonly handler: ProcessHandler<ProcessData, Message>;
    // The saga/timeout stores for THIS process. Each registered process keeps its own stores so a
    // bus with multiple processes routes each one's state to the correct backend.
    readonly store?: ISagaStore;
    readonly timeoutStore?: ITimeoutStore;
}

interface ProcessDefinition {
    readonly dataType: string;
    readonly store?: ISagaStore;
    readonly timeoutStore?: ITimeoutStore;
}

export class ProcessRegistry {
    private readonly dataTypes = new Set<string>();
    private lastDataType: string | undefined;
    private readonly processes = new Map<string, ProcessDefinition>();
    private readonly byMessageType = new Map<string, ProcessRegistration[]>();

    registerDataType(dataType: string): void {
        this.dataTypes.add(dataType);
        this.lastDataType = dataType;
    }

    isDataTypeRegistered(dataType: string): boolean {
        return this.dataTypes.has(dataType);
    }

    lastRegisteredDataType(): string | undefined {
        return this.lastDataType;
    }

    registerProcess(
        processName: string,
        options: { dataType: string; store?: ISagaStore; timeoutStore?: ITimeoutStore },
    ): void {
        if (!this.dataTypes.has(options.dataType)) {
            throw new InvalidOperationError(
                `process data type '${options.dataType}' is not registered`,
            );
        }
        this.processes.set(processName, {
            dataType: options.dataType,
            store: options.store,
            timeoutStore: options.timeoutStore,
        });
    }

    hasAny(): boolean {
        return this.processes.size > 0;
    }

    /** Distinct (by reference) timeout stores across all registered processes. */
    distinctTimeoutStores(): readonly ITimeoutStore[] {
        const seen = new Set<ITimeoutStore>();
        for (const def of this.processes.values()) {
            if (def.timeoutStore) seen.add(def.timeoutStore);
        }
        return [...seen];
    }

    startsWith<TData extends ProcessData, TMessage extends Message>(
        processName: string,
        messageType: string,
        handler: ProcessHandler<TData, TMessage>,
    ): void {
        this.add(processName, messageType, handler as ProcessHandler<ProcessData, Message>, true);
    }

    handles<TData extends ProcessData, TMessage extends Message>(
        processName: string,
        messageType: string,
        handler: ProcessHandler<TData, TMessage>,
    ): void {
        this.add(processName, messageType, handler as ProcessHandler<ProcessData, Message>, false);
    }

    registrationsFor(messageType: string): readonly ProcessRegistration[] {
        return this.byMessageType.get(messageType) ?? [];
    }

    allMessageTypes(): readonly string[] {
        return [...this.byMessageType.keys()];
    }

    processDataType(processName: string): string | undefined {
        return this.processes.get(processName)?.dataType;
    }

    private add(
        processName: string,
        messageType: string,
        handler: ProcessHandler<ProcessData, Message>,
        isStart: boolean,
    ): void {
        const def = this.processes.get(processName);
        if (!def) {
            throw new InvalidOperationError(`process '${processName}' is not registered`);
        }
        const list = this.byMessageType.get(messageType) ?? [];
        list.push({
            processName,
            dataType: def.dataType,
            messageType,
            isStart,
            handler,
            store: def.store,
            timeoutStore: def.timeoutStore,
        });
        this.byMessageType.set(messageType, list);
    }
}
