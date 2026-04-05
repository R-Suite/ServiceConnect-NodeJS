"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionManager = void 0;
const amqp_connection_manager_1 = __importDefault(require("amqp-connection-manager"));
const errors_1 = require("../../errors");
/**
 * Manages AMQP connection lifecycle including reconnection.
 */
class ConnectionManager {
    config;
    connection = null;
    channel = null;
    logger;
    constructor(config) {
        this.config = config;
        this.logger = config.logger;
    }
    /**
     * Connect to RabbitMQ with retry logic
     */
    async connect() {
        const maxRetries = 5;
        let lastError;
        const hosts = Array.isArray(this.config.amqpSettings.host)
            ? this.config.amqpSettings.host
            : [this.config.amqpSettings.host];
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                this.connection = amqp_connection_manager_1.default.connect(hosts);
                this.setupConnectionEvents();
                await new Promise((resolve, reject) => {
                    this.connection.on('connect', () => {
                        this.logger?.info(`Connected to RabbitMQ: ${this.config.amqpSettings.queue.name}`);
                        resolve();
                    });
                    this.connection.on('connectFailed', (err) => {
                        reject(err.err);
                    });
                    // Timeout if no connect event within 30 seconds
                    setTimeout(() => {
                        reject(new Error('Connection timeout'));
                    }, 30000);
                });
                return;
            }
            catch (error) {
                lastError = error;
                this.logger?.error(`Connection attempt ${attempt} failed`, error);
                if (attempt < maxRetries) {
                    const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
                    await this.sleep(delay);
                }
            }
        }
        throw new errors_1.ConnectionError(`Failed to connect to RabbitMQ after ${maxRetries} attempts`, errors_1.ConnectionErrorCodes.CONNECTION_FAILED, false, lastError);
    }
    /**
     * Create a channel with the given setup function
     */
    async createChannel(setup) {
        if (!this.connection) {
            throw new errors_1.ConnectionError('Not connected to RabbitMQ', errors_1.ConnectionErrorCodes.CONNECTION_FAILED, true);
        }
        this.channel = this.connection.createChannel({
            json: true,
            setup: async (channel) => {
                await channel.prefetch(this.config.amqpSettings.prefetch);
                await setup(channel);
            }
        });
        // Wait for channel to be ready
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Channel creation timeout'));
            }, 30000);
            this.channel.on('connect', () => {
                clearTimeout(timeout);
                resolve();
            });
            this.channel.on('error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });
        });
    }
    /**
     * Get the current channel
     */
    getChannel() {
        return this.channel;
    }
    /**
     * Check if connected
     */
    isConnected() {
        return this.connection?.isConnected() ?? false;
    }
    /**
     * Close connection gracefully
     */
    async close() {
        await this.channel?.close();
        await this.connection?.close();
        this.channel = null;
        this.connection = null;
    }
    /**
     * Setup connection event handlers
     */
    setupConnectionEvents() {
        if (!this.connection)
            return;
        this.connection.on('disconnect', (err) => {
            this.logger?.error(`Disconnected from RabbitMQ: ${this.config.amqpSettings.queue.name}`, err.err);
        });
        this.connection.on('blocked', (reason) => {
            this.logger?.error(`Blocked by RabbitMQ broker: ${this.config.amqpSettings.queue.name}`, reason);
        });
    }
    /**
     * Sleep utility
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
exports.ConnectionManager = ConnectionManager;
//# sourceMappingURL=connection-manager.js.map