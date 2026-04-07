import { v4 as uuidv4 } from 'uuid';
import merge from 'deepmerge';
import settings from '../settings';
import { ValidationError, ValidationErrorCodes } from '../errors';
import { BusCore } from './bus-core';
import { MessageHandlerManager } from './message-handler';
import { FilterManager } from './filter-manager';
import { RequestReplyManager } from './request-reply-manager';
import { createMessageId } from '../types';
import type {
  ServiceConnectConfig,
  BusConfig,
  Message,
  MessageHandler,
  MessageHeaders,
  ReplyCallback
} from '../types';

/**
 * Bus class - main entry point for messaging operations.
 * Maintains backward-compatible public API while delegating to internal modules.
 */
export class Bus {
  public id: string;
  public initialized = false;
  public config: BusConfig;

  private core: BusCore;
  private handlerManager: MessageHandlerManager;
  private filterManager: FilterManager;
  private requestReplyManager: RequestReplyManager;

  constructor(config: ServiceConnectConfig) {
    this.id = uuidv4();

    // Validate config before merging
    this.validateConfig(config);

    // Merge with defaults
    this.config = merge(settings(), config, {
      arrayMerge: (_target, source) => source,
    }) as BusConfig;

    // Initialize modules
    this.core = new BusCore(this.config);
    this.handlerManager = new MessageHandlerManager();
    this.filterManager = new FilterManager();
    this.requestReplyManager = new RequestReplyManager();

    // Initialize handlers from config for backward compatibility
    this.handlerManager.initializeFromConfig(this.config.handlers);

    // Bind methods to preserve 'this' context
    this.init = this.init.bind(this);
    this.addHandler = this.addHandler.bind(this);
    this.removeHandler = this.removeHandler.bind(this);
    this.send = this.send.bind(this);
    this.publish = this.publish.bind(this);
    this.sendRequest = this.sendRequest.bind(this);
    this.publishRequest = this.publishRequest.bind(this);
    this.close = this.close.bind(this);
    this.isConnected = this.isConnected.bind(this);
    this.isHandled = this.isHandled.bind(this);
  }

  /**
   * Validate user-provided configuration
   */
  private validateConfig(config: ServiceConnectConfig): void {
    if (!config.amqpSettings?.queue?.name) {
      throw new ValidationError(
        'Queue name is required. Provide amqpSettings.queue.name in config.',
        ValidationErrorCodes.CONFIG_MISSING_QUEUE_NAME,
        'amqpSettings.queue.name'
      );
    }
  }

  /**
   * Initialize the bus - creates client and connects to broker
   */
  async init(): Promise<void> {
    await this.core.init(this.consumeMessage.bind(this));
    this.initialized = this.core.initialized;
  }

  /**
   * Add a handler for a message type
   */
  async addHandler<T extends Message>(
    messageType: string,
    handler: MessageHandler<T>
  ): Promise<void> {
    const normalizedType = messageType.replaceAll('.', '');

    // Start consuming the type if not wildcard
    if (normalizedType !== '*' && this.core.client) {
      await this.core.client.consumeType(normalizedType);
    }

    this.handlerManager.addHandler(messageType, handler);
  }

  /**
   * Remove a handler for a message type
   */
  async removeHandler<T extends Message>(
    messageType: string,
    handler: MessageHandler<T>
  ): Promise<void> {
    this.handlerManager.removeHandler(messageType, handler);

    // Stop consuming if no more handlers
    if (messageType !== '*' && this.handlerManager.hasNoHandlers(messageType)) {
      const normalizedType = messageType.replace(/\./g, '');
      if (this.core.client) {
        await this.core.client.removeType(normalizedType);
      }
    }
  }

  /**
   * Check if a message type is being handled
   */
  isHandled(messageType: string): boolean {
    return this.handlerManager.isHandled(messageType);
  }

  /**
   * Send a command to specified endpoint(s)
   */
  async send<T extends Message>(
    endpoint: string | string[],
    type: string,
    message: T,
    headers: Partial<MessageHeaders> = {}
  ): Promise<void> {
    const shouldSend = await this.filterManager.executeOutgoing(
      this.config.filters.outgoing,
      message,
      headers as Record<string, unknown>,
      type,
      this
    );

    if (!shouldSend || !this.core.client) {
      return;
    }

    await this.core.client.send(
      endpoint,
      type,
      message,
      headers as MessageHeaders
    );
  }

  /**
   * Publish an event of specified type
   */
  async publish<T extends Message>(
    type: string,
    message: T,
    headers: Partial<MessageHeaders> = {}
  ): Promise<void> {
    const shouldPublish = await this.filterManager.executeOutgoing(
      this.config.filters.outgoing,
      message,
      headers as Record<string, unknown>,
      type,
      this
    );

    if (!shouldPublish || !this.core.client) {
      return;
    }

    await this.core.client.publish(type, message, headers as MessageHeaders);
  }

  /**
   * Send a command and wait for reply
   */
  async sendRequest<T1 extends Message, T2 extends Message>(
    endpoint: string | string[],
    type: string,
    message: T1,
    callback: MessageHandler<T2>,
    headers: Partial<MessageHeaders> = {}
  ): Promise<void> {
    const shouldSend = await this.filterManager.executeOutgoing(
      this.config.filters.outgoing,
      message,
      headers as Record<string, unknown>,
      type,
      this
    );

    if (!shouldSend) {
      return;
    }

    const messageId = uuidv4();
    const endpoints = Array.isArray(endpoint) ? endpoint : [endpoint];

    this.requestReplyManager.registerRequest(
      messageId,
      endpoints.length,
      callback as MessageHandler<Message>,
      null
    );

    headers.RequestMessageId = createMessageId(messageId);

    if (this.core.client) {
      await this.core.client.send(
        endpoint,
        type,
        message,
        headers as MessageHeaders
      );
    }
  }

  /**
   * Publish an event and wait for replies
   */
  async publishRequest<T1 extends Message, T2 extends Message>(
    type: string,
    message: T1,
    callback: MessageHandler<T2>,
    expected: number | null = null,
    timeout: number | null = null,
    headers: Partial<MessageHeaders> = {}
  ): Promise<void> {
    const shouldPublish = await this.filterManager.executeOutgoing(
      this.config.filters.outgoing,
      message,
      headers as Record<string, unknown>,
      type,
      this
    );

    if (!shouldPublish) {
      return;
    }

    const messageId = uuidv4();
    const expectedCount = expected === null ? -1 : expected;
    const timeoutMs = timeout ?? this.config.amqpSettings.defaultRequestTimeout;

    this.requestReplyManager.registerRequest(
      messageId,
      expectedCount,
      callback as MessageHandler<Message>,
      timeoutMs
    );

    headers.RequestMessageId = createMessageId(messageId);

    if (this.core.client) {
      await this.core.client.publish(type, message, headers as MessageHeaders);
    }
  }

  /**
   * Close the bus and cleanup
   */
  async close(): Promise<void> {
    this.requestReplyManager.cleanupAll();
    await this.core.close();
    this.initialized = false;
  }

  /**
   * Check if connected to broker
   */
  async isConnected(): Promise<boolean> {
    return this.core.isConnected();
  }

  /**
   * Internal callback for consuming messages from client
   */
  private async consumeMessage(
    message: Message,
    headers: Record<string, unknown>,
    type: string
  ): Promise<void> {
    try {
      // Execute before filters
      const shouldProcess = await this.filterManager.executeBefore(
        this.config.filters.before,
        message,
        headers,
        type,
        this
      );

      if (!shouldProcess) {
        return;
      }

      // Process handlers
      const handlers = this.handlerManager.getHandlers(type);
      const replyCallback = this.createReplyCallback(headers);

      const handlerPromises = handlers.map(handler =>
        handler(message, headers as MessageHeaders, type, replyCallback)
      );

      // Process request/reply callbacks
      const responseId = headers.ResponseMessageId as string;
      if (responseId) {
        await this.requestReplyManager.processReply(
          responseId,
          message,
          headers,
          type
        );
      }

      await Promise.all(handlerPromises);

      // Execute after filters
      await this.filterManager.executeAfter(
        this.config.filters.after,
        message,
        headers,
        type,
        this
      );
    } catch (error) {
      if (this.config.logger) {
        this.config.logger?.error('Error processing message', error);
      }
      // Re-throw to let the MessageProcessor handle retry logic
      throw error;
    }
  }

  /**
   * Create a reply callback for handlers
   */
  private createReplyCallback(
    headers: Record<string, unknown>
  ): ReplyCallback<Message> {
    return async (type: string, message: Message): Promise<void> => {
      const replyHeaders = {
        ...headers,
        ResponseMessageId: headers.RequestMessageId,
      };
      const sourceAddress = headers.SourceAddress as string;
      if (sourceAddress && this.core.client) {
        await this.core.client.send(
          sourceAddress,
          type,
          message,
          replyHeaders as MessageHeaders
        );
      }
    };
  }
}
