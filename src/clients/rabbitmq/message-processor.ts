import type { ConsumeMessage, ConfirmChannel } from 'amqplib';
import type { ChannelWrapper } from 'amqp-connection-manager';
import { MessageError, MessageErrorCodes } from '../../errors';
import type { BusConfig, ConsumeMessageCallback, Message } from '../../types';
import { RetryManager } from './retry-manager';

/**
 * Processes incoming RabbitMQ messages with error handling.
 */
export class MessageProcessor {
  private config: BusConfig;
  private consumeCallback: ConsumeMessageCallback;
  private retryManager: RetryManager;
  private logger: BusConfig['logger'];
  private processing = 0;
  private channel: ConfirmChannel | null = null;
  private channelWrapper: ChannelWrapper | null = null;
  private processingDoneCallbacks: (() => void)[] = [];
  private closing = false;

  constructor(config: BusConfig, consumeCallback: ConsumeMessageCallback, retryManager: RetryManager) {
    this.config = config;
    this.consumeCallback = consumeCallback;
    this.retryManager = retryManager;
    this.logger = config.logger;
  }

  /**
   * Signal that the processor is shutting down.
   * New messages will be nacked with requeue=true so another consumer can pick them up.
   */
  beginClosing(): void {
    this.closing = true;
  }

  /**
   * Start consuming messages from the queue
   */
  async startConsuming(channel: ConfirmChannel, channelWrapper?: ChannelWrapper): Promise<void> {
    this.channel = channel;
    this.channelWrapper = channelWrapper ?? null;
    await channel.consume(
      this.config.amqpSettings.queue.name,
      this.handleMessage.bind(this),
      { noAck: this.config.amqpSettings.queue.noAck }
    );
  }

  /**
   * Handle incoming message
   */
  private async handleMessage(rawMessage: ConsumeMessage | null): Promise<void> {
    if (rawMessage === null) return;

    if (this.closing) {
      if (!this.config.amqpSettings.queue.noAck && this.channel) {
        try {
          this.channel.nack(rawMessage, false, true);
        } catch {
          // Channel may be closed, ignore
        }
      }
      return;
    }

    this.processing++;

    try {
      const typeName = rawMessage.properties.headers?.TypeName;

      if (!typeName) {
        this.logger?.error('Message does not contain TypeName header');
        this.safeAck(rawMessage);
        return;
      }

      await this.processMessage(rawMessage);
      this.safeAck(rawMessage);
    } catch (error) {
      this.logger?.error('Error processing message', error);
      if (!this.config.amqpSettings.queue.noAck && this.channel) {
        try {
          this.channel.nack(rawMessage, false, false);
        } catch (nackError) {
          this.logger?.error('Failed to nack message (channel may be closed)', nackError);
        }
      }
    } finally {
      this.processing--;
      if (this.processing === 0 && this.processingDoneCallbacks.length > 0) {
        const callbacks = this.processingDoneCallbacks.splice(0);
        for (const cb of callbacks) {
          cb();
        }
      }
    }
  }

  /**
   * Process the message content
   */
  private async processMessage(rawMessage: ConsumeMessage): Promise<void> {
    const headers = rawMessage.properties.headers ?? {};
    const typeName = headers.TypeName as string;

    let exception: unknown = undefined;
    let success = false;
    let parsedMessage: Message = { CorrelationId: '' } as Message;
    let parseSucceeded = false;

    try {
      const encoding = (rawMessage.properties.contentEncoding as BufferEncoding) || 'utf-8';
      parsedMessage = JSON.parse(rawMessage.content.toString(encoding)) as Message;
      parseSucceeded = true;

      await this.consumeCallback(parsedMessage, headers, typeName);
      success = true;
    } catch (error) {
      exception = error;
      success = false;
      if (!parseSucceeded) {
        // Use a placeholder for parsedMessage -- raw content will be preserved for retry/error queues
        parsedMessage = { CorrelationId: '' } as Message;
      }
    }

    // Use RetryManager to handle result (audit queue, retry queue, or error queue)
    // Pass raw content buffer so retry/error paths preserve original bytes even if parsing failed
    if (this.channelWrapper) {
      try {
        await this.retryManager.handleResult(
          this.channelWrapper,
          rawMessage,
          { success, exception, parsedMessage, rawContent: success ? undefined : rawMessage.content }
        );
      } catch (retryError) {
        this.logger?.error('RetryManager failed to handle result', retryError);
        // If the handler failed AND retry routing also failed, re-throw so handleMessage nacks
        if (!success) {
          throw retryError;
        }
        // If the handler succeeded but retry routing failed (e.g. audit publish error),
        // swallow the error -- the message was processed successfully and should be acked
      }
    }

    // If processing failed and there's no retry manager, throw error for the caller to handle
    // When channelWrapper exists, we've already handled the failure through RetryManager (or tried to)
    if (!success && !this.channelWrapper) {
      throw new MessageError(
        'Failed to process message',
        MessageErrorCodes.HANDLER_FAILED,
        false,
        exception as Error,
        typeName
      );
    }
  }

  /**
   * Safely acknowledge message, catching errors if channel is closed
   */
  private safeAck(rawMessage: ConsumeMessage): void {
    if (!this.config.amqpSettings.queue.noAck && this.channel) {
      try {
        this.channel.ack(rawMessage);
      } catch (ackError) {
        this.logger?.error('Failed to ack message (channel may be closed)', ackError);
      }
    }
  }

  /**
   * Get count of messages currently being processed
   */
  getProcessingCount(): number {
    return this.processing;
  }

  /**
   * Wait for all messages to finish processing
   */
  async waitForProcessing(timeoutMs: number = 60000): Promise<void> {
    if (this.processing === 0) {
      return;
    }

    return new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        // Remove this callback from the array on timeout
        const idx = this.processingDoneCallbacks.indexOf(done);
        if (idx !== -1) {
          this.processingDoneCallbacks.splice(idx, 1);
        }
        resolve();
      }, timeoutMs);

      const done = () => {
        clearTimeout(timeout);
        resolve();
      };

      this.processingDoneCallbacks.push(done);
    });
  }
}
