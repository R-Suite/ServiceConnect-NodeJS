"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Bus = void 0;
const uuid_1 = require("uuid");
const deepmerge_1 = __importDefault(require("deepmerge"));
const settings_1 = __importDefault(require("../settings"));
const errors_1 = require("../errors");
const bus_core_1 = require("./bus-core");
const message_handler_1 = require("./message-handler");
const filter_manager_1 = require("./filter-manager");
const request_reply_manager_1 = require("./request-reply-manager");
/**
 * Bus class - main entry point for messaging operations.
 * Maintains backward-compatible public API while delegating to internal modules.
 */
class Bus {
    id;
    initialized = false;
    config;
    core;
    handlerManager;
    filterManager;
    requestReplyManager;
    constructor(config) {
        this.id = (0, uuid_1.v4)();
        // Validate config before merging
        this.validateConfig(config);
        // Merge with defaults
        this.config = (0, deepmerge_1.default)((0, settings_1.default)(), config);
        // Initialize modules
        this.core = new bus_core_1.BusCore(this.config);
        this.handlerManager = new message_handler_1.MessageHandlerManager();
        this.filterManager = new filter_manager_1.FilterManager();
        this.requestReplyManager = new request_reply_manager_1.RequestReplyManager();
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
    validateConfig(config) {
        if (!config.amqpSettings?.queue?.name) {
            throw new errors_1.ValidationError('Queue name is required. Provide amqpSettings.queue.name in config.', errors_1.ValidationErrorCodes.CONFIG_MISSING_QUEUE_NAME, 'amqpSettings.queue.name');
        }
    }
    /**
     * Initialize the bus - creates client and connects to broker
     */
    async init() {
        await this.core.init(this.consumeMessage.bind(this));
        this.initialized = this.core.initialized;
    }
    /**
     * Add a handler for a message type
     */
    async addHandler(messageType, handler) {
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
    async removeHandler(messageType, handler) {
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
    isHandled(messageType) {
        return this.handlerManager.isHandled(messageType);
    }
    /**
     * Send a command to specified endpoint(s)
     */
    async send(endpoint, type, message, headers = {}) {
        const shouldSend = await this.filterManager.executeOutgoing(this.config.filters.outgoing, message, headers, type, this);
        if (!shouldSend || !this.core.client) {
            return;
        }
        await this.core.client.send(endpoint, type, message, headers);
    }
    /**
     * Publish an event of specified type
     */
    async publish(type, message, headers = {}) {
        const shouldPublish = await this.filterManager.executeOutgoing(this.config.filters.outgoing, message, headers, type, this);
        if (!shouldPublish || !this.core.client) {
            return;
        }
        await this.core.client.publish(type, message, headers);
    }
    /**
     * Send a command and wait for reply
     */
    async sendRequest(endpoint, type, message, callback, headers = {}) {
        const shouldSend = await this.filterManager.executeOutgoing(this.config.filters.outgoing, message, headers, type, this);
        if (!shouldSend) {
            return;
        }
        const messageId = (0, uuid_1.v4)();
        const endpoints = Array.isArray(endpoint) ? endpoint : [endpoint];
        this.requestReplyManager.registerRequest(messageId, endpoints.length, callback, null);
        headers.RequestMessageId = messageId;
        if (this.core.client) {
            await this.core.client.send(endpoint, type, message, headers);
        }
    }
    /**
     * Publish an event and wait for replies
     */
    async publishRequest(type, message, callback, expected = null, timeout = 10000, headers = {}) {
        const shouldPublish = await this.filterManager.executeOutgoing(this.config.filters.outgoing, message, headers, type, this);
        if (!shouldPublish) {
            return;
        }
        const messageId = (0, uuid_1.v4)();
        const expectedCount = expected === null ? -1 : expected;
        this.requestReplyManager.registerRequest(messageId, expectedCount, callback, timeout);
        headers.RequestMessageId = messageId;
        if (this.core.client) {
            await this.core.client.publish(type, message, headers);
        }
    }
    /**
     * Close the bus and cleanup
     */
    async close() {
        this.requestReplyManager.cleanupAll();
        await this.core.close();
        this.initialized = false;
    }
    /**
     * Check if connected to broker
     */
    async isConnected() {
        return this.core.isConnected();
    }
    /**
     * Internal callback for consuming messages from client
     */
    async consumeMessage(message, headers, type) {
        try {
            // Execute before filters
            const shouldProcess = await this.filterManager.executeBefore(this.config.filters.before, message, headers, type, this);
            if (!shouldProcess) {
                return;
            }
            // Process handlers
            const handlers = this.handlerManager.getHandlers(type);
            const replyCallback = this.createReplyCallback(headers);
            const handlerPromises = handlers.map(handler => handler(message, headers, type, replyCallback));
            // Process request/reply callbacks
            const responseId = headers.ResponseMessageId;
            if (responseId) {
                await this.requestReplyManager.processReply(responseId, message, headers, type);
            }
            await Promise.all(handlerPromises);
            // Execute after filters
            await this.filterManager.executeAfter(this.config.filters.after, message, headers, type, this);
        }
        catch (error) {
            if (this.config.logger) {
                this.config.logger.error('Error processing message', error);
            }
            throw error;
        }
    }
    /**
     * Create a reply callback for handlers
     */
    createReplyCallback(headers) {
        return async (type, message) => {
            headers.ResponseMessageId = headers.RequestMessageId;
            const sourceAddress = headers.SourceAddress;
            if (sourceAddress && this.core.client) {
                await this.core.client.send(sourceAddress, type, message, headers);
            }
        };
    }
}
exports.Bus = Bus;
//# sourceMappingURL=index.js.map