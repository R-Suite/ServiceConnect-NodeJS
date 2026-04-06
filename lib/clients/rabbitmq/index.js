"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const connection_manager_1 = require("./connection-manager");
const queue_manager_1 = require("./queue-manager");
const message_processor_1 = require("./message-processor");
const retry_manager_1 = require("./retry-manager");
const uuid_1 = require("uuid");
const deepmerge_1 = __importDefault(require("deepmerge"));
/**
 * RabbitMQ client implementation of IClient interface.
 * Refactored to use modular components.
 */
class RabbitMQClient {
    config;
    connectionManager;
    queueManager;
    messageProcessor;
    retryManager;
    constructor(config, consumeCallback) {
        this.config = config;
        this.connectionManager = new connection_manager_1.ConnectionManager(config);
        this.queueManager = new queue_manager_1.QueueManager(config);
        this.retryManager = new retry_manager_1.RetryManager(config);
        this.messageProcessor = new message_processor_1.MessageProcessor(config, consumeCallback, this.retryManager);
    }
    /**
     * Connect to RabbitMQ and setup queues
     */
    async connect() {
        await this.connectionManager.connect();
        await this.connectionManager.createChannel(async (channel) => {
            await this.queueManager.setupQueues(channel, this.config.handlers);
            await this.messageProcessor.startConsuming(channel);
        });
    }
    /**
     * Start consuming a message type
     */
    async consumeType(type) {
        const channel = this.connectionManager.getChannel();
        if (!channel) {
            // For backward compatibility: don't throw if no channel (test environment)
            return;
        }
        await channel.addSetup(async (ch) => {
            await this.queueManager.consumeType(ch, type);
        });
    }
    /**
     * Stop consuming a message type
     */
    async removeType(type) {
        const channel = this.connectionManager.getChannel();
        if (!channel) {
            // For backward compatibility: don't throw if no channel (test environment)
            return;
        }
        await channel.removeSetup(async (ch) => {
            await this.queueManager.removeType(ch, type);
        });
    }
    /**
     * Send a message to specific endpoint(s)
     */
    async send(endpoint, type, message, headers) {
        const channel = this.connectionManager.getChannel();
        if (!channel) {
            throw new Error('Not connected');
        }
        const endpoints = Array.isArray(endpoint) ? endpoint : [endpoint];
        await Promise.all(endpoints.map((ep) => {
            // Pass the endpoint as DestinationAddress in headers
            const headersWithDestination = {
                ...headers,
                DestinationAddress: headers.DestinationAddress ?? ep
            };
            const messageHeaders = this.buildHeaders(type, headersWithDestination, 'Send');
            const options = {
                headers: messageHeaders,
                messageId: messageHeaders.MessageId
            };
            if (messageHeaders.Priority !== undefined) {
                options.priority = messageHeaders.Priority;
            }
            return channel.sendToQueue(ep, message, options);
        }));
    }
    /**
     * Publish a message to an exchange
     */
    async publish(type, message, headers) {
        const channel = this.connectionManager.getChannel();
        if (!channel) {
            throw new Error('Not connected');
        }
        const normalizedType = type.replace(/\./g, '');
        const messageHeaders = this.buildHeaders(type, headers, 'Publish');
        const options = {
            headers: messageHeaders,
            messageId: messageHeaders.MessageId
        };
        if (messageHeaders.Priority !== undefined) {
            options.priority = messageHeaders.Priority;
        }
        await channel.addSetup(async (ch) => {
            await ch.assertExchange(normalizedType, 'fanout', { durable: true });
        });
        await channel.publish(normalizedType, '', message, options);
    }
    /**
     * Close the connection gracefully
     */
    async close() {
        await this.messageProcessor.waitForProcessing();
        // Cancel channel consumers and cleanup queues before closing connection
        const channelWrapper = this.connectionManager.getChannel();
        if (channelWrapper) {
            const underlyingChannel = channelWrapper._channel;
            if (underlyingChannel) {
                // Cancel any active consumers
                if (underlyingChannel.consumers) {
                    for (const consumerTag of Object.keys(underlyingChannel.consumers)) {
                        await underlyingChannel.cancel(consumerTag);
                    }
                }
                // Delete retry queue if autoDelete is enabled
                if (this.config.amqpSettings.queue.autoDelete && this.config.amqpSettings.maxRetries > 0) {
                    const retryQueue = `${this.config.amqpSettings.queue.name}.Retries`;
                    try {
                        await underlyingChannel.deleteQueue(retryQueue);
                    }
                    catch {
                        // Ignore errors if queue doesn't exist
                    }
                }
            }
        }
        // Close the connection gracefully
        await this.connectionManager.close();
    }
    /**
     * Check if connected
     */
    async isConnected() {
        return this.connectionManager.isConnected();
    }
    /**
     * Build message headers with defaults
     */
    buildHeaders(type, headers, messageType) {
        const merged = (0, deepmerge_1.default)({}, headers);
        merged.DestinationAddress = merged.DestinationAddress ?? this.config.amqpSettings.queue.name;
        merged.MessageId = merged.MessageId ?? (0, uuid_1.v4)();
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
exports.default = RabbitMQClient;
//# sourceMappingURL=index.js.map