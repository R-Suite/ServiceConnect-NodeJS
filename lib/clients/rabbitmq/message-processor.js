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
    logger;
    processing = 0;
    constructor(config, consumeCallback) {
        this.config = config;
        this.consumeCallback = consumeCallback;
        this.logger = config.logger;
    }
    /**
     * Start consuming messages from the queue
     */
    async startConsuming(channel) {
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
        try {
            const message = JSON.parse(rawMessage.content.toString());
            await this.consumeCallback(message, headers, headers.TypeName);
        }
        catch (error) {
            throw new errors_1.MessageError('Failed to process message', errors_1.MessageErrorCodes.HANDLER_FAILED, false, error, headers.TypeName);
        }
    }
    /**
     * Acknowledge message if noAck is false
     */
    ackMessage(_rawMessage) {
        if (!this.config.amqpSettings.queue.noAck) {
            // Channel ack is handled by the wrapper
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