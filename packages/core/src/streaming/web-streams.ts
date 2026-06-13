import type { Message } from '../message.js';
import type { StreamSender } from './sender.js';

export function senderToWritableStream<T extends Message>(
    senderPromise: Promise<StreamSender<T>>,
): WritableStream<T> {
    let sender: StreamSender<T> | undefined;

    return new WritableStream<T>({
        async start() {
            sender = await senderPromise;
        },
        async write(chunk) {
            if (!sender) throw new Error('writable not started');
            await sender.sendChunk(chunk);
        },
        async close() {
            if (sender) await sender.complete();
        },
        async abort(reason) {
            if (sender) {
                const message =
                    reason instanceof Error ? reason.message : String(reason ?? 'aborted');
                await sender.fault(message);
            }
        },
    });
}
