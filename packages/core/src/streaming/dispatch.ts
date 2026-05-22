import type { Envelope } from '../envelope.js';
import type { Logger } from '../logger.js';
import type { Message, MessageHeaders } from '../message.js';
import type { IMessageSerializer } from '../serialization/serializer.js';
import type { ConsumeResult } from '../transport.js';
import { StreamReceiver } from './receiver.js';
import { StreamHeaders } from './stream-headers.js';

export interface StreamHandlerRegistration<T extends Message> {
  readonly messageType: string;
  readonly handler: (stream: AsyncIterable<T>) => Promise<void>;
}

export class StreamRegistry {
  private readonly byType = new Map<string, StreamHandlerRegistration<Message>>();
  private readonly receiversByStreamId = new Map<string, StreamReceiver<Message>>();
  private readonly handlerPromises = new Map<string, Promise<void>>();

  registerHandler<T extends Message>(
    messageType: string,
    handler: (stream: AsyncIterable<T>) => Promise<void>,
  ): void {
    this.byType.set(messageType, {
      messageType,
      handler: handler as (stream: AsyncIterable<Message>) => Promise<void>,
    });
  }

  registrationFor(messageType: string): StreamHandlerRegistration<Message> | undefined {
    return this.byType.get(messageType);
  }

  ensureReceiver(messageType: string, streamId: string): StreamReceiver<Message> | undefined {
    const reg = this.byType.get(messageType);
    if (!reg) return undefined;
    let receiver = this.receiversByStreamId.get(streamId);
    if (!receiver) {
      receiver = new StreamReceiver<Message>(streamId);
      this.receiversByStreamId.set(streamId, receiver);
      const promise = reg
        .handler(receiver)
        .catch(() => undefined)
        .finally(() => {
          this.receiversByStreamId.delete(streamId);
          this.handlerPromises.delete(streamId);
        });
      this.handlerPromises.set(streamId, promise);
    }
    return receiver;
  }

  async drain(): Promise<void> {
    await Promise.all([...this.handlerPromises.values()]);
  }
}

export interface StreamBranchDeps {
  registry: StreamRegistry;
  serializer: IMessageSerializer;
  logger: Logger;
}

export interface StreamBranchOutcome {
  ran: boolean;
  result?: ConsumeResult;
}

export async function runStreamBranch(
  envelope: Envelope,
  deps: StreamBranchDeps,
): Promise<StreamBranchOutcome> {
  const headers = envelope.headers as MessageHeaders;
  const streamId = headers[StreamHeaders.StreamId];
  if (typeof streamId !== 'string') return { ran: false };

  const messageType = typeof headers.messageType === 'string' ? headers.messageType : '';
  const reg = deps.registry.registrationFor(messageType);
  if (!reg) return { ran: false };

  const receiver = deps.registry.ensureReceiver(messageType, streamId);
  if (!receiver) return { ran: false };

  const seqRaw = headers[StreamHeaders.SequenceNumber];
  const sequenceNumber = typeof seqRaw === 'string' ? Number(seqRaw) : 0;
  const isEnd = headers[StreamHeaders.IsEndOfStream] === 'true';
  const faultRaw = headers[StreamHeaders.StreamFault];
  const faulted = typeof faultRaw === 'string' ? faultRaw : undefined;

  let chunk: Message | undefined;
  if (!isEnd && faulted === undefined) {
    chunk = deps.serializer.deserialize(envelope.body, messageType) as Message;
  }

  try {
    receiver.push({ chunk, sequenceNumber, isEnd, faulted });
  } catch (err) {
    const wrapped = err instanceof Error ? err : new Error(String(err));
    deps.logger.warn('stream receiver push threw; chunk dropped', {
      streamId,
      error: wrapped.message,
    });
    return {
      ran: true,
      result: { success: false, notHandled: false, error: wrapped, terminalFailure: true },
    };
  }

  return {
    ran: true,
    result: { success: true, notHandled: false, terminalFailure: false },
  };
}
