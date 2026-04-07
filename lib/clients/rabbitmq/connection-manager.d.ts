import { ChannelWrapper } from 'amqp-connection-manager';
import type { ConfirmChannel } from 'amqplib';
import type { BusConfig } from '../../types';
/**
 * Manages AMQP connection lifecycle including reconnection.
 */
export declare class ConnectionManager {
    private config;
    private connection;
    private channel;
    private logger;
    constructor(config: BusConfig);
    /**
     * Connect to RabbitMQ with retry logic
     */
    connect(): Promise<void>;
    /**
     * Create a channel with the given setup function
     */
    createChannel(setup: (channel: ConfirmChannel) => Promise<void>): Promise<void>;
    /**
     * Get the current channel
     */
    getChannel(): ChannelWrapper | null;
    /**
     * Check if connected
     */
    isConnected(): boolean;
    /**
     * Close connection gracefully
     */
    close(): Promise<void>;
    /**
     * Setup connection event handlers
     */
    private setupConnectionEvents;
    /**
     * Sleep utility
     */
    private sleep;
}
//# sourceMappingURL=connection-manager.d.ts.map