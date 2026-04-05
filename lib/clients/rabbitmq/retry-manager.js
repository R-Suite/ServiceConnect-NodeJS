"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RetryManager = void 0;
/**
 * Manages message retry logic and dead lettering.
 */
class RetryManager {
    config;
    constructor(config) {
        this.config = config;
    }
    /**
     * Handle message processing result - retry or send to error queue
     */
    async handleResult(channel, rawMessage, result) {
        if (result.success) {
            await this.handleSuccess(channel, rawMessage);
        }
        else {
            await this.handleFailure(channel, rawMessage, result.exception);
        }
    }
    /**
     * Handle successful processing
     */
    async handleSuccess(channel, rawMessage) {
        if (!this.config.amqpSettings.auditEnabled) {
            return;
        }
        // Send to audit queue
        const headers = rawMessage.properties.headers ?? {};
        headers.TimeProcessed = headers.TimeProcessed ?? new Date().toISOString();
        await channel.sendToQueue(this.config.amqpSettings.auditQueue, JSON.parse(rawMessage.content.toString()), {
            headers,
            messageId: rawMessage.properties.messageId
        });
    }
    /**
     * Handle failed processing - retry or error queue
     */
    async handleFailure(channel, rawMessage, exception) {
        const headers = rawMessage.properties.headers ?? {};
        const retryCount = headers.RetryCount ?? 0;
        if (this.config.amqpSettings.maxRetries === 0) {
            // Retries disabled, send directly to error queue
            await this.sendToErrorQueue(channel, rawMessage, exception);
            return;
        }
        if (retryCount < this.config.amqpSettings.maxRetries) {
            // Retry the message
            headers.RetryCount = retryCount + 1;
            await channel.sendToQueue(`${this.config.amqpSettings.queue.name}.Retries`, JSON.parse(rawMessage.content.toString()), {
                headers,
                messageId: rawMessage.properties.messageId
            });
        }
        else {
            // Max retries exceeded, send to error queue
            headers.Exception = exception;
            await this.sendToErrorQueue(channel, rawMessage, exception);
        }
    }
    /**
     * Send message to error queue
     */
    async sendToErrorQueue(channel, rawMessage, exception) {
        const headers = rawMessage.properties.headers ?? {};
        headers.Exception = exception;
        await channel.sendToQueue(this.config.amqpSettings.errorQueue, JSON.parse(rawMessage.content.toString()), {
            headers,
            messageId: rawMessage.properties.messageId
        });
    }
    /**
     * Delete the retry queue during cleanup
     */
    async cleanup(channel) {
        if (this.config.amqpSettings.maxRetries > 0 &&
            this.config.amqpSettings.queue.autoDelete) {
            const retryQueue = `${this.config.amqpSettings.queue.name}.Retries`;
            await channel.deleteQueue(retryQueue);
        }
    }
}
exports.RetryManager = RetryManager;
//# sourceMappingURL=retry-manager.js.map