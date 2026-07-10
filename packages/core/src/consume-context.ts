import type { Bus } from './bus.js';
import type { Logger } from './logger.js';
import type { CorrelationId, Message, MessageHeaders, MessageId } from './message.js';
import type { ReplyOptions } from './options/reply.js';

export interface ConsumeContext {
    readonly bus: Bus;
    readonly headers: Readonly<MessageHeaders>;
    readonly messageId: MessageId | undefined;
    readonly correlationId: CorrelationId;
    readonly messageType: string;
    readonly signal: AbortSignal;
    readonly logger: Logger;

    reply<TReply extends Message>(
        typeName: string,
        message: TReply,
        options?: ReplyOptions,
    ): Promise<void>;
}

export function createConsumeContext(args: {
    bus: Bus;
    headers: MessageHeaders;
    signal: AbortSignal;
    logger: Logger;
}): ConsumeContext {
    const frozenHeaders = Object.freeze({ ...args.headers });
    const childLogger =
        args.logger.child?.({
            messageType: frozenHeaders.messageType,
            messageId: frozenHeaders.messageId,
            correlationId: frozenHeaders.correlationId,
        }) ?? args.logger;

    const ctx: ConsumeContext = {
        bus: args.bus,
        headers: frozenHeaders,
        messageId: frozenHeaders.messageId,
        correlationId: frozenHeaders.correlationId,
        messageType: frozenHeaders.messageType,
        signal: args.signal,
        logger: childLogger,
        async reply<TReply extends Message>(
            typeName: string,
            message: TReply,
            options?: ReplyOptions,
        ): Promise<void> {
            const endpoint = frozenHeaders.sourceAddress;
            if (!endpoint) {
                throw new Error(
                    'reply() requires the incoming message to carry a sourceAddress header',
                );
            }
            const replyHeaders: Record<string, string> = { ...(options?.headers ?? {}) };
            if (frozenHeaders.requestMessageId) {
                replyHeaders.responseMessageId = frozenHeaders.requestMessageId;
            }
            await args.bus.send(typeName, message, { endpoint, headers: replyHeaders });
        },
    };

    return ctx;
}
