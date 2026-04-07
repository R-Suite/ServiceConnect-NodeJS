"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageProcessor = void 0;
const errors_1 = require("../../errors");
/**
 * Processes incoming RabbitMQ messages with error handling.
 */
class MessageProcessor {
    config;
    consumeCallback;
    retryManager;
    logger;
    processing = 0;
    channel = null;
    channelWrapper = null;
    constructor(config, consumeCallback, retryManager) {
        this.config = config;
        this.consumeCallback = consumeCallback;
        this.retryManager = retryManager;
        this.logger = config.logger;
    }
    /**
     * Start consuming messages from the queue
     */
    async startConsuming(channel, channelWrapper) {
        this.channel = channel;
        this.channelWrapper = channelWrapper ?? null;
        await channel.consume(this.config.amqpSettings.queue.name, this.handleMessage.bind(this), { noAck: this.config.amqpSettings.queue.noAck });
    }
    /**
     * Handle incoming message
     */
    async handleMessage(rawMessage) {
        if (rawMessage === null)
            return;
        this.processing++;
        try {
            const typeName = rawMessage.properties.headers?.TypeName;
            if (!typeName) {
                this.logger?.error('Message does not contain TypeName header');
                this.ackMessage(rawMessage);
                return;
            }
            await this.processMessage(rawMessage);
        }
        catch (error) {
            this.logger?.error('Error processing message', error);
        }
        finally {
            this.ackMessage(rawMessage);
            this.processing--;
        }
    }
    /**
     * Process the message content
     */
    async processMessage(rawMessage) {
        const headers = rawMessage.properties.headers ?? {};
        const typeName = headers.TypeName;
        let exception = undefined;
        let success = false;
        try {
            const message = JSON.parse(rawMessage.content.toString());
            await this.consumeCallback(message, headers, typeName);
            headers.TimeProcessed = new Date().toISOString();
            success = true;
        }
        catch (error) {
            exception = error;
            success = false;
        }
        // Use RetryManager to handle result (audit queue, retry queue, or error queue)
        if (this.channelWrapper) {
            await this.retryManager.handleResult(this.channelWrapper, rawMessage, { success, exception });
        }
        // If processing failed and there's no retry manager, throw error for the caller to handle
        // When channelWrapper exists, we've already handled the failure through RetryManager
        if (!success && !this.channelWrapper) {
            throw new errors_1.MessageError('Failed to process message', errors_1.MessageErrorCodes.HANDLER_FAILED, false, exception, typeName);
        }
    }
    /**
     * Acknowledge message if noAck is false
     */
    ackMessage(rawMessage) {
        if (!this.config.amqpSettings.queue.noAck && this.channel) {
            this.channel.ack(rawMessage);
        }
    }
    /**
     * Get count of messages currently being processed
     */
    getProcessingCount() {
        return this.processing;
    }
    /**
     * Wait for all messages to finish processing
     */
    async waitForProcessing(timeoutMs = 60000) {
        const startTime = Date.now();
        while (this.processing > 0 && (Date.now() - startTime) < timeoutMs) {
            await this.sleep(100);
        }
    }
    /**
     * Sleep utility
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
exports.MessageProcessor = MessageProcessor;
//# sourceMappingURL=message-processor.js.map