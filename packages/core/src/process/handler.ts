import type { ConsumeContext } from '../consume-context.js';
import type { Message } from '../message.js';
import type { ProcessData } from '../persistence/saga-store.js';

export interface ProcessContext extends ConsumeContext {
    markComplete(): void;
    requestTimeout(name: string, runAt: Date, payload?: Record<string, unknown>): Promise<void>;
}

export interface ProcessHandler<TData extends ProcessData, TMessage extends Message> {
    handle(message: TMessage, data: TData, context: ProcessContext): Promise<void>;
    correlate(message: TMessage): string;
}
