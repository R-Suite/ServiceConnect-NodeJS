import type { ConfirmChannel, Options } from 'amqplib';
import { ChannelWrapper } from 'amqp-connection-manager';
import { ConnectionManager } from './connection-manager';
import { QueueManager } from './queue-manager';
import { MessageProcessor } from './message-processor';
import { RetryManager } from './retry-manager';
import { v4 as uuidv4 } from 'uuid';
import merge from 'deepmerge';
import { ValidationError, ValidationErrorCodes, ConnectionError, ConnectionErrorCodes } from '../../errors';
import { createMessageId } from '../../types';
import type {
  BusConfig,
  ConsumeMessageCallback,
  IClient,
  Message,
  MessageHeaders
} from '../../types';

/**
 * RabbitMQ client implementation of IClient interface.
 * Refactored to use modular components.
 */
export default class RabbitMQClient implements IClient {
  private config: BusConfig;
  private connectionManager: ConnectionManager;
  private queueManager: QueueManager;
  private messageProcessor: MessageProcessor;
  private retryManager: RetryManager;
  private assertedExchanges: Set<string> = new Set();
  private typeSetupFunctions: Map<string, (ch: ConfirmChannel) => Promise<void>> = new Map();

  constructor(config: BusConfig, consumeCallback: ConsumeMessageCallback) {
    this.config = config;

    this.connectionManager = new ConnectionManager(config);
    this.queueManager = new QueueManager(config);
    this.retryManager = new RetryManager(config);
    this.messageProcessor = new MessageProcessor(config, consumeCallback, this.retryManager);
  }

  /**
   * Connect to RabbitMQ and setup queues
   */
  async connect(): Promise<void> {
    await this.connectionManager.connect();

    await this.connectionManager.createChannel(async (channel) => {
      this.assertedExchanges.clear();
      await this.queueManager.setupQueues(channel, this.config.handlers);

      // Register static handler types (from config) in typeSetupFunctions
      // so that removeType() can unbind them later (#46)
      for (const key of Object.keys(this.config.handlers)) {
        if (key === '*') {
          continue;
        }
        const normalizedType = key.replaceAll('.', '');
        if (!this.typeSetupFunctions.has(normalizedType)) {
          const setupFn = async (ch: ConfirmChannel) => {
            await this.queueManager.consumeType(ch, normalizedType);
          };
          this.typeSetupFunctions.set(normalizedType, setupFn);
        }
      }

      const channelWrapper = this.connectionManager.getChannel();
      await this.messageProcessor.startConsuming(channel, channelWrapper ?? undefined);
    });
  }

  /**
   * Start consuming a message type
   */
  async consumeType(type: string): Promise<void> {
    const channel = this.connectionManager.getChannel();
    if (!channel) {
      // For backward compatibility: don't throw if no channel (test environment)
      return;
    }

    // Guard against duplicate setup functions (#42):
    // If a setup already exists for this type, remove the old one first
    const existingSetupFn = this.typeSetupFunctions.get(type);
    if (existingSetupFn) {
      await channel.removeSetup(existingSetupFn, async (ch: ConfirmChannel) => {
        await this.queueManager.removeType(ch, type);
      });
    }

    // Store the setup function reference so removeType can pass the same reference to removeSetup
    const setupFn = async (ch: ConfirmChannel) => {
      await this.queueManager.consumeType(ch, type);
    };
    this.typeSetupFunctions.set(type, setupFn);

    await channel.addSetup(setupFn);
  }

  /**
   * Stop consuming a message type
   */
  async removeType(type: string): Promise<void> {
    const channel = this.connectionManager.getChannel();
    if (!channel) {
      // For backward compatibility: don't throw if no channel (test environment)
      return;
    }

    // Use the same function reference that was passed to addSetup
    const setupFn = this.typeSetupFunctions.get(type);
    if (setupFn) {
      await channel.removeSetup(setupFn, async (ch: ConfirmChannel) => {
        await this.queueManager.removeType(ch, type);
      });
      this.typeSetupFunctions.delete(type);
    }
  }

  /**
   * Send a message to specific endpoint(s)
   */
  async send<T extends Message>(
    endpoint: string | string[],
    type: string,
    message: T,
    headers: MessageHeaders
  ): Promise<void> {
    const channel = this.connectionManager.getChannel();
    if (!channel) {
      throw new ConnectionError(
        'Not connected to RabbitMQ',
        ConnectionErrorCodes.NOT_CONNECTED,
        false
      );
    }

    const endpoints = Array.isArray(endpoint) ? endpoint : [endpoint];
    
    if (endpoints.length === 0) {
      throw new ValidationError(
        'At least one endpoint must be provided',
        ValidationErrorCodes.INVALID_ENDPOINT,
        'endpoint'
      );
    }

    for (const ep of endpoints) {
      if (!ep || ep.trim() === '') {
        throw new ValidationError(
          'Endpoint cannot be empty',
          ValidationErrorCodes.INVALID_ENDPOINT,
          'endpoint'
        );
      }
    }
    
    await Promise.all(
      endpoints.map((ep) => {
        return this.sendToEndpoint(channel, ep, type, message, headers);
      })
    );
  }

  /**
   * Send a message to a single endpoint
   */
  private async sendToEndpoint<T extends Message>(
    channel: ChannelWrapper,
    endpoint: string,
    type: string,
    message: T,
    headers: MessageHeaders
  ): Promise<void> {
    const headersWithDestination = {
      ...headers,
      DestinationAddress: headers.DestinationAddress ?? endpoint
    };
    const messageHeaders = this.buildHeaders(type, headersWithDestination, 'Send');
    const options = this.buildPublishOptions(messageHeaders);

    await channel.sendToQueue(endpoint, Buffer.from(JSON.stringify(message)), options);
  }

  /**
   * Build publish options from message headers
   */
  private buildPublishOptions(messageHeaders: MessageHeaders): Options.Publish {
    const options: Options.Publish = {
      headers: messageHeaders,
      messageId: messageHeaders.MessageId
    };

    if (messageHeaders.Priority !== undefined) {
      options.priority = messageHeaders.Priority;
    }

    return options;
  }

  /**
   * Publish a message to an exchange
   */
  async publish<T extends Message>(
    type: string,
    message: T,
    headers: MessageHeaders
  ): Promise<void> {
    const channel = this.connectionManager.getChannel();
    if (!channel) {
      throw new ConnectionError(
        'Not connected to RabbitMQ',
        ConnectionErrorCodes.NOT_CONNECTED,
        false
      );
    }

    if (!type || type.trim() === '') {
      throw new ValidationError(
        'Message type cannot be empty',
        ValidationErrorCodes.INVALID_MESSAGE_TYPE,
        'type'
      );
    }

    const normalizedType = type.replaceAll('.', '');
    const messageHeaders = this.buildHeaders(type, headers, 'Publish');
    const options = this.buildPublishOptions(messageHeaders);

    // Only assert exchange if not already asserted
    if (!this.assertedExchanges.has(normalizedType)) {
      await channel.addSetup(async (ch: ConfirmChannel) => {
        await ch.assertExchange(normalizedType, 'fanout', { durable: true });
      });
      this.assertedExchanges.add(normalizedType);
    }

    await channel.publish(normalizedType, '', Buffer.from(JSON.stringify(message)), options);
  }

  /**
   * Close the connection gracefully
   */
  async close(): Promise<void> {
    this.messageProcessor.beginClosing();
    await this.messageProcessor.waitForProcessing();
    await this.connectionManager.close();
  }

  /**
   * Check if connected
   */
  async isConnected(): Promise<boolean> {
    return this.connectionManager.isConnected();
  }

  /**
   * Build message headers with defaults
   */
  private buildHeaders(
    type: string,
    headers: MessageHeaders,
    messageType: 'Send' | 'Publish'
  ): MessageHeaders {
    const merged = merge({}, headers) as MessageHeaders;
    
    merged.DestinationAddress = merged.DestinationAddress ?? this.config.amqpSettings.queue.name;
    merged.MessageId = merged.MessageId ?? createMessageId(uuidv4());
    merged.MessageType = merged.MessageType ?? messageType;
    merged.SourceAddress = merged.SourceAddress ?? this.config.amqpSettings.queue.name;
    merged.TimeSent = merged.TimeSent ?? new Date().toISOString();
    merged.TypeName = merged.TypeName ?? type;
    merged.FullTypeName = merged.FullTypeName ?? type;
    merged.ConsumerType = merged.ConsumerType ?? 'RabbitMQ';
    merged.Language = merged.Language ?? 'TypeScript';

    return merged;
  }
}
