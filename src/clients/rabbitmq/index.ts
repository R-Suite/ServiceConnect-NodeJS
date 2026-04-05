import type { ConfirmChannel, Options } from 'amqplib';
import { ConnectionManager } from './connection-manager';
import { QueueManager } from './queue-manager';
import { MessageProcessor } from './message-processor';
import { v4 as uuidv4 } from 'uuid';
import merge from 'deepmerge';
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

  constructor(config: BusConfig, consumeCallback: ConsumeMessageCallback) {
    this.config = config;

    this.connectionManager = new ConnectionManager(config);
    this.queueManager = new QueueManager(config);
    this.messageProcessor = new MessageProcessor(config, consumeCallback);
  }

  /**
   * Connect to RabbitMQ and setup queues
   */
  async connect(): Promise<void> {
    await this.connectionManager.connect();
    
    await this.connectionManager.createChannel(async (channel) => {
      await this.queueManager.setupQueues(channel, this.config.handlers);
      await this.messageProcessor.startConsuming(channel);
    });
  }

  /**
   * Start consuming a message type
   */
  async consumeType(type: string): Promise<void> {
    const channel = this.connectionManager.getChannel();
    if (!channel) {
      throw new Error('Not connected');
    }

    await channel.addSetup(async (ch: ConfirmChannel) => {
      await this.queueManager.consumeType(ch, type);
    });
  }

  /**
   * Stop consuming a message type
   */
  async removeType(type: string): Promise<void> {
    const channel = this.connectionManager.getChannel();
    if (!channel) {
      return;
    }

    await channel.removeSetup(async (ch: ConfirmChannel) => {
      await this.queueManager.removeType(ch, type);
    });
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
      throw new Error('Not connected');
    }

    const endpoints = Array.isArray(endpoint) ? endpoint : [endpoint];
    const messageHeaders = this.buildHeaders(type, headers, 'Send');

    await Promise.all(
      endpoints.map((ep) => {
        const options: Options.Publish = {
          headers: messageHeaders,
          messageId: messageHeaders.MessageId
        };
        
        if (messageHeaders.Priority !== undefined) {
          options.priority = messageHeaders.Priority;
        }

        return channel.sendToQueue(ep, message, options);
      })
    );
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
      throw new Error('Not connected');
    }

    const normalizedType = type.replace(/\./g, '');
    const messageHeaders = this.buildHeaders(type, headers, 'Publish');

    const options: Options.Publish = {
      headers: messageHeaders,
      messageId: messageHeaders.MessageId
    };

    if (messageHeaders.Priority !== undefined) {
      options.priority = messageHeaders.Priority;
    }

    await channel.addSetup(async (ch: ConfirmChannel) => {
      await ch.assertExchange(normalizedType, 'fanout', { durable: true });
    });

    await channel.publish(normalizedType, '', message, options);
  }

  /**
   * Close the connection gracefully
   */
  async close(): Promise<void> {
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
    merged.MessageId = merged.MessageId ?? (uuidv4() as unknown as import('../../types').MessageId);
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
