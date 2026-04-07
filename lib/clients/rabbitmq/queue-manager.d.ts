import type { ConfirmChannel } from 'amqplib';
import type { BusConfig } from '../../types';
/**
 * Manages RabbitMQ queue, exchange, and binding setup.
 */
export declare class QueueManager {
    private config;
    private logger;
    private setupErrors;
    constructor(config: BusConfig);
    /**
     * Check if there were setup errors
     */
    hasSetupErrors(): boolean;
    /**
     * Get setup errors
     */
    getSetupErrors(): Map<string, Error>;
    /**
     * Clear setup errors
     */
    clearSetupErrors(): void;
    /**
     * Setup all queues, exchanges, and bindings
     */
    setupQueues(channel: ConfirmChannel, handlers: Record<string, unknown>): Promise<void>;
    /**
     * Create the main consumer queue
     */
    private createMainQueue;
    /**
     * Bind message type exchanges to the main queue
     */
    private bindMessageTypes;
    /**
     * Create retry queue with dead letter exchange
     */
    private createRetryQueue;
    /**
     * Create error queue and exchange
     */
    private createErrorQueue;
    /**
     * Create audit queue and exchange
     */
    private createAuditQueue;
    /**
     * Consume a message type (create exchange and bind)
     */
    consumeType(channel: ConfirmChannel, type: string): Promise<void>;
    /**
     * Stop consuming a message type (unbind)
     */
    removeType(channel: ConfirmChannel, type: string): Promise<void>;
}
//# sourceMappingURL=queue-manager.d.ts.map