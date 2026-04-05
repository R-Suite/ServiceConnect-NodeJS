import type { ChannelWrapper } from 'amqp-connection-manager';
import type { ConsumeMessage, ConfirmChannel } from 'amqplib';
import type { BusConfig } from '../../types';

interface ProcessingResult {
  success: boolean;
  exception?: unknown;
}

/**
 * Manages message retry logic and dead lettering.
 */
export class RetryManager {
  private config: BusConfig;

  constructor(config: BusConfig) {
    this.config = config;
  }

  /**
   * Handle message processing result - retry or send to error queue
   */
  async handleResult(
    channel: ChannelWrapper,
    rawMessage: ConsumeMessage,
    result: ProcessingResult
  ): Promise<void> {
    if (result.success) {
      await this.handleSuccess(channel, rawMessage);
    } else {
      await this.handleFailure(channel, rawMessage, result.exception);
    }
  }

  /**
   * Handle successful processing
   */
  private async handleSuccess(
    channel: ChannelWrapper,
    rawMessage: ConsumeMessage
  ): Promise<void> {
    if (!this.config.amqpSettings.auditEnabled) {
      return;
    }

    // Send to audit queue
    const headers = rawMessage.properties.headers ?? {};
    headers.TimeProcessed = headers.TimeProcessed ?? new Date().toISOString();

    await channel.sendToQueue(
      this.config.amqpSettings.auditQueue,
      JSON.parse(rawMessage.content.toString()),
      {
        headers,
        messageId: rawMessage.properties.messageId
      }
    );
  }

  /**
   * Handle failed processing - retry or error queue
   */
  private async handleFailure(
    channel: ChannelWrapper,
    rawMessage: ConsumeMessage,
    exception: unknown
  ): Promise<void> {
    const headers = rawMessage.properties.headers ?? {};
    const retryCount = (headers.RetryCount as number) ?? 0;

    if (this.config.amqpSettings.maxRetries === 0) {
      // Retries disabled, send directly to error queue
      await this.sendToErrorQueue(channel, rawMessage, exception);
      return;
    }

    if (retryCount < this.config.amqpSettings.maxRetries) {
      // Retry the message
      headers.RetryCount = retryCount + 1;

      await channel.sendToQueue(
        `${this.config.amqpSettings.queue.name}.Retries`,
        JSON.parse(rawMessage.content.toString()),
        {
          headers,
          messageId: rawMessage.properties.messageId
        }
      );
    } else {
      // Max retries exceeded, send to error queue
      headers.Exception = exception;
      await this.sendToErrorQueue(channel, rawMessage, exception);
    }
  }

  /**
   * Send message to error queue
   */
  private async sendToErrorQueue(
    channel: ChannelWrapper,
    rawMessage: ConsumeMessage,
    exception: unknown
  ): Promise<void> {
    const headers = rawMessage.properties.headers ?? {};
    headers.Exception = exception;

    await channel.sendToQueue(
      this.config.amqpSettings.errorQueue,
      JSON.parse(rawMessage.content.toString()),
      {
        headers,
        messageId: rawMessage.properties.messageId
      }
    );
  }

  /**
   * Delete the retry queue during cleanup
   */
  async cleanup(channel: ConfirmChannel): Promise<void> {
    if (
      this.config.amqpSettings.maxRetries > 0 &&
      this.config.amqpSettings.queue.autoDelete
    ) {
      const retryQueue = `${this.config.amqpSettings.queue.name}.Retries`;
      await channel.deleteQueue(retryQueue);
    }
  }
}
