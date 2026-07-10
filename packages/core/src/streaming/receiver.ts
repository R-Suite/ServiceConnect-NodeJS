import { StreamFaultedError, StreamSequenceError } from '../errors.js';
import type { Message } from '../message.js';

export interface ReceivedChunk<T extends Message> {
    chunk: T | undefined;
    sequenceNumber: number;
    isEnd: boolean;
    faulted: string | undefined;
}

export interface StreamReceiverOptions {
    maxBufferedChunks?: number;
}

export class StreamReceiver<T extends Message> implements AsyncIterable<T> {
    private readonly buffer = new Map<number, ReceivedChunk<T>>();
    private nextExpected = 0;
    private endSequenceNumber: number | undefined;
    private faultedReason: string | undefined;
    private readonly resolvers: ((v: IteratorResult<T>) => void)[] = [];
    private readonly rejectors: ((e: Error) => void)[] = [];
    private readonly pendingDelivery: T[] = [];
    private readonly maxBufferedChunks: number;

    constructor(
        public readonly streamId: string,
        options: StreamReceiverOptions = {},
    ) {
        this.maxBufferedChunks = options.maxBufferedChunks ?? 1000;
    }

    isFaulted(): boolean {
        return this.faultedReason !== undefined;
    }

    push(rec: ReceivedChunk<T>): void {
        if (this.faultedReason !== undefined && rec.faulted === undefined && !rec.isEnd) {
            return;
        }
        if (rec.faulted !== undefined) {
            this.faultedReason = rec.faulted;
            this.endSequenceNumber = rec.sequenceNumber;
            const err = new StreamFaultedError(rec.faulted);
            for (const r of this.rejectors.splice(0)) r(err);
            for (const res of this.resolvers.splice(0))
                res({ value: undefined as never, done: true });
            return;
        }
        if (rec.isEnd) {
            this.endSequenceNumber = rec.sequenceNumber;
        }
        if (this.buffer.size >= this.maxBufferedChunks && !this.buffer.has(rec.sequenceNumber)) {
            throw new StreamSequenceError(
                `stream ${this.streamId} exceeded maxBufferedChunks=${this.maxBufferedChunks}`,
            );
        }
        this.buffer.set(rec.sequenceNumber, rec);
        this.drain();
    }

    private drain(): void {
        while (this.buffer.has(this.nextExpected)) {
            const rec = this.buffer.get(this.nextExpected) as ReceivedChunk<T>;
            this.buffer.delete(this.nextExpected);
            this.nextExpected++;
            if (rec.isEnd) {
                for (const r of this.resolvers.splice(0))
                    r({ value: undefined as never, done: true });
                return;
            }
            if (rec.chunk !== undefined) {
                const waiter = this.resolvers.shift();
                if (waiter) {
                    waiter({ value: rec.chunk, done: false });
                } else {
                    this.pendingDelivery.push(rec.chunk);
                }
            }
        }
    }

    [Symbol.asyncIterator](): AsyncIterator<T> {
        return {
            next: () => {
                if (this.pendingDelivery.length > 0) {
                    const v = this.pendingDelivery.shift() as T;
                    return Promise.resolve({ value: v, done: false });
                }
                if (this.faultedReason !== undefined) {
                    return Promise.reject(new StreamFaultedError(this.faultedReason));
                }
                if (
                    this.endSequenceNumber !== undefined &&
                    this.nextExpected > this.endSequenceNumber
                ) {
                    return Promise.resolve({ value: undefined as never, done: true });
                }
                return new Promise<IteratorResult<T>>((resolve, reject) => {
                    this.resolvers.push(resolve);
                    this.rejectors.push(reject);
                });
            },
        };
    }
}
