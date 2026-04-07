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

  constructor(config: BusConfig, consumeCallback: ConsumeMessageCallback, retryManager: RetryManager) {
    this.config = config;
    this.consumeCallback = consumeCallback;
    this.retryManager = retryManager;
    this.logger = config.logger;
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

    this.processing++;

    try {
      const typeName = rawMessage.properties.headers?.TypeName;

      if (!typeName) {
        this.logger?.error('Message does not contain TypeName header');
        this.ackMessage(rawMessage);
        this.processing--;
        return;
      }

      await this.processMessage(rawMessage);
      this.ackMessage(rawMessage);
    } catch (error) {
      this.logger?.error('Error processing message', error);
      // Do NOT ack — the message will be redelivered by RabbitMQ
    } finally {
      this.processing--;
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

    try {
      const message = JSON.parse(rawMessage.content.toString()) as Message;

      await this.consumeCallback(message, headers, typeName);
      headers.TimeProcessed = new Date().toISOString();
      success = true;
    } catch (error) {
      exception = error;
      success = false;
    }

    // Use RetryManager to handle result (audit queue, retry queue, or error queue)
    if (this.channelWrapper) {
      await this.retryManager.handleResult(
        this.channelWrapper,
        rawMessage,
        { success, exception }
      );
    }

    // If processing failed and there's no retry manager, throw error for the caller to handle
    // When channelWrapper exists, we've already handled the failure through RetryManager
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
   * Acknowledge message if noAck is false
   */
  private ackMessage(rawMessage: ConsumeMessage): void {
    if (!this.config.amqpSettings.queue.noAck && this.channel) {
      this.channel.ack(rawMessage);
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
    const startTime = Date.now();
    
    while (this.processing > 0 && (Date.now() - startTime) < timeoutMs) {
      await this.sleep(100);
    }
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
