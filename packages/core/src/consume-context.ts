// Stub for Task 7 — full implementation arrives in Task 8.
// HandlerRegistry only references ConsumeContext through type-only imports,
// so this stub provides the type without any runtime surface.
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
