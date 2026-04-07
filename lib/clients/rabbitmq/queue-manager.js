"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueManager = void 0;
/**
 * Manages RabbitMQ queue, exchange, and binding setup.
 */
class QueueManager {
    config;
    logger;
    setupErrors = new Map();
    constructor(config) {
        this.config = config;
        this.logger = config.logger;
    }
    /**
     * Check if there were setup errors
     */
    hasSetupErrors() {
        return this.setupErrors.size > 0;
    }
    /**
     * Get setup errors
     */
    getSetupErrors() {
        return this.setupErrors;
    }
    /**
     * Clear setup errors
     */
    clearSetupErrors() {
        this.setupErrors.clear();
    }
    /**
     * Setup all queues, exchanges, and bindings
     */
    async setupQueues(channel, handlers) {
        await this.createMainQueue(channel);
        await this.bindMessageTypes(channel, handlers);
        if (this.config.amqpSettings.maxRetries > 0) {
            await this.createRetryQueue(channel);
        }
        await this.createErrorQueue(channel);
        if (this.config.amqpSettings.auditEnabled) {
            await this.createAuditQueue(channel);
        }
    }
    /**
     * Create the main consumer queue
     */
    async createMainQueue(channel) {
        const queueName = this.config.amqpSettings.queue.name;
        const queueOpts = {
            durable: this.config.amqpSettings.queue.durable,
            exclusive: this.config.amqpSettings.queue.exclusive,
            autoDelete: this.config.amqpSettings.queue.autoDelete,
            arguments: this.config.amqpSettings.queue.arguments
        };
        if (this.config.amqpSettings.queue.maxPriority !== undefined) {
            queueOpts.maxPriority = this.config.amqpSettings.queue.maxPriority;
        }
        this.logger?.info(`Creating queue: ${queueName}`);
        // When multiple consumers share a queue (competing consumers pattern),
        // we should only delete the queue if it truly doesn't exist or if we're
        // sure no other consumer is using it. This is tricky to determine reliably,
        // so we use a simpler approach: try to assert the queue, and if it fails
        // due to argument mismatch (another consumer created it with different args),
        // we attempt to delete and recreate.
        try {
            await channel.assertQueue(queueName, queueOpts);
        }
        catch (err) {
            // If assertQueue fails, it might be because the queue exists with different arguments
            // (e.g., different queue properties like maxPriority). In this case, try to delete
            // and recreate, but only if autoDelete is enabled.
            if (this.config.amqpSettings.queue.autoDelete) {
                try {
                    await channel.deleteQueue(queueName);
                    this.logger?.info(`Deleted existing queue with mismatched args: ${queueName}`);
                    await channel.assertQueue(queueName, queueOpts);
                }
                catch (deleteErr) {
                    // If delete also fails (e.g., queue in use), log the error but continue
                    this.setupErrors.set(queueName, deleteErr);
                    this.logger?.error(`Failed to delete queue ${queueName}:`, deleteErr);
                }
            }
            else {
                this.setupErrors.set(queueName, err);
            }
        }
    }
    /**
     * Bind message type exchanges to the main queue
     */
    async bindMessageTypes(channel, handlers) {
        this.logger?.info('Binding message handlers to queue');
        for (const key of Object.keys(handlers)) {
            const type = key.replace(/\./g, '');
            await channel.assertExchange(type, 'fanout', { durable: true });
            await channel.bindQueue(this.config.amqpSettings.queue.name, type, '');
        }
    }
    /**
     * Create retry queue with dead letter exchange
     */
    async createRetryQueue(channel) {
        this.logger?.info('Creating retry queue');
        const queueName = this.config.amqpSettings.queue.name;
        const deadLetterExchange = `${queueName}.Retries.DeadLetter`;
        const retryQueue = `${queueName}.Retries`;
        await channel.assertExchange(deadLetterExchange, 'direct', { durable: true });
        // Try to delete existing retry queue first to avoid TTL conflicts
        try {
            await channel.deleteQueue(retryQueue);
            this.logger?.info(`Deleted existing retry queue: ${retryQueue}`);
        }
        catch {
            // Queue didn't exist, ignore error
        }
        await channel.assertQueue(retryQueue, {
            durable: this.config.amqpSettings.queue.durable,
            arguments: {
                'x-dead-letter-exchange': deadLetterExchange,
                'x-message-ttl': this.config.amqpSettings.retryDelay,
                ...(this.config.amqpSettings.queue.retryQueueArguments ?? {})
            }
        });
        await channel.bindQueue(queueName, deadLetterExchange, retryQueue);
    }
    /**
     * Create error queue and exchange
     */
    async createErrorQueue(channel) {
        this.logger?.info('Configuring error queue');
        const errorQueue = this.config.amqpSettings.errorQueue;
        await channel.assertExchange(errorQueue, 'direct', { durable: false });
        await channel.assertQueue(errorQueue, {
            durable: true,
            autoDelete: false,
            arguments: {
                ...(this.config.amqpSettings.queue.utilityQueueArguments ?? {})
            }
        });
    }
    /**
     * Create audit queue and exchange
     */
    async createAuditQueue(channel) {
        this.logger?.info('Configuring audit queue');
        const auditQueue = this.config.amqpSettings.auditQueue;
        await channel.assertExchange(auditQueue, 'direct', { durable: false });
        await channel.assertQueue(auditQueue, {
            durable: true,
            autoDelete: false,
            arguments: {
                ...(this.config.amqpSettings.queue.utilityQueueArguments ?? {})
            }
        });
    }
    /**
     * Consume a message type (create exchange and bind)
     */
    async consumeType(channel, type) {
        await channel.assertExchange(type, 'fanout', { durable: true });
        await channel.bindQueue(this.config.amqpSettings.queue.name, type, '');
    }
    /**
     * Stop consuming a message type (unbind)
     */
    async removeType(channel, type) {
        await channel.unbindQueue(this.config.amqpSettings.queue.name, type, '');
    }
}
exports.QueueManager = QueueManager;
//# sourceMappingURL=queue-manager.js.map