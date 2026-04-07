import type { ChannelWrapper } from 'amqp-connection-manager';
import type { ConsumeMessage } from 'amqplib';
import type { BusConfig, Message } from '../../types';

interface ProcessingResult {
  success: boolean;
  exception?: unknown;
  parsedMessage: Message;
  rawContent?: Buffer | undefined;
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
      await this.handleSuccess(channel, rawMessage, result.parsedMessage);
    } else {
      await this.handleFailure(channel, rawMessage, result.parsedMessage, result.exception, result.rawContent);
    }
  }

  /**
   * Handle successful processing
   */
  private async handleSuccess(
    channel: ChannelWrapper,
    rawMessage: ConsumeMessage,
    parsedMessage: Message
  ): Promise<void> {
    if (!this.config.amqpSettings.auditEnabled) {
      return;
    }

    // Clone headers to avoid mutating the raw message
    const headers = { ...(rawMessage.properties.headers ?? {}) };
    headers.TimeProcessed = headers.TimeProcessed ?? new Date().toISOString();

    await channel.sendToQueue(
      this.config.amqpSettings.auditQueue,
      Buffer.from(JSON.stringify(parsedMessage)),
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
    parsedMessage: Message,
    exception: unknown,
    rawContent?: Buffer
  ): Promise<void> {
    const headers = { ...(rawMessage.properties.headers ?? {}) };
    const retryCount = Math.max(0, Math.floor(Number(headers.RetryCount) || 0));

    if (this.config.amqpSettings.maxRetries === 0) {
      // Retries disabled, send directly to error queue
      await this.sendToErrorQueue(channel, rawMessage, parsedMessage, exception, rawContent);
      return;
    }

    if (retryCount < this.config.amqpSettings.maxRetries) {
      // Retry the message — use raw content to preserve original bytes
      headers.RetryCount = retryCount + 1;
      const content = rawContent ?? Buffer.from(JSON.stringify(parsedMessage));

      await channel.sendToQueue(
        `${this.config.amqpSettings.queue.name}.Retries`,
        content,
        {
          headers,
          messageId: rawMessage.properties.messageId
        }
      );
    } else {
      // Max retries exceeded, send to error queue
      await this.sendToErrorQueue(channel, rawMessage, parsedMessage, exception, rawContent);
    }
  }

  /**
   * Send message to error queue
   */
  private async sendToErrorQueue(
    channel: ChannelWrapper,
    rawMessage: ConsumeMessage,
    parsedMessage: Message,
    exception: unknown,
    rawContent?: Buffer
  ): Promise<void> {
    // Clone headers to avoid mutating the raw message
    const headers = { ...(rawMessage.properties.headers ?? {}) };
    // Convert exception to string for header compatibility
    headers.Exception = String(exception);

    // Log the error before sending to error queue
    this.config.logger?.error('Message processing failed, sending to error queue', exception);

    // Use raw content to preserve original bytes (avoids data corruption on parse failure)
    const content = rawContent ?? Buffer.from(JSON.stringify(parsedMessage));

    await channel.sendToQueue(
      this.config.amqpSettings.errorQueue,
      content,
      {
        headers,
        messageId: rawMessage.properties.messageId
      }
    );
  }
}
