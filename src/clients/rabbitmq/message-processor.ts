import type { ConsumeMessage, ConfirmChannel } from 'amqplib';
import { MessageError, MessageErrorCodes } from '../../errors';
import type { BusConfig, ConsumeMessageCallback, Message } from '../../types';

/**
 * Processes incoming RabbitMQ messages with error handling.
 */
export class MessageProcessor {
  private config: BusConfig;
  private consumeCallback: ConsumeMessageCallback;
  private logger: BusConfig['logger'];
  private processing = 0;
  private channel: ConfirmChannel | null = null;

  constructor(config: BusConfig, consumeCallback: ConsumeMessageCallback) {
    this.config = config;
    this.consumeCallback = consumeCallback;
    this.logger = config.logger;
  }

  /**
   * Start consuming messages from the queue
   */
  async startConsuming(channel: ConfirmChannel): Promise<void> {
    this.channel = channel;
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
        return;
      }

      await this.processMessage(rawMessage);
    } catch (error) {
      this.logger?.error('Error processing message', error);
    } finally {
      this.ackMessage(rawMessage);
      this.processing--;
    }
  }

  /**
   * Process the message content
   */
  private async processMessage(rawMessage: ConsumeMessage): Promise<void> {
    const headers = rawMessage.properties.headers ?? {};
    
    try {
      const message = JSON.parse(rawMessage.content.toString()) as Message;
      
      await this.consumeCallback(
        message,
        headers,
        headers.TypeName as string
      );
    } catch (error) {
      throw new MessageError(
        'Failed to process message',
        MessageErrorCodes.HANDLER_FAILED,
        false,
        error as Error,
        headers.TypeName as string
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
