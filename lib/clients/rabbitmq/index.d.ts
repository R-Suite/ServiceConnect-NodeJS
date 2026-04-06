import type { BusConfig, ConsumeMessageCallback, IClient, Message, MessageHeaders } from '../../types';
/**
 * RabbitMQ client implementation of IClient interface.
 * Refactored to use modular components.
 */
export default class RabbitMQClient implements IClient {
    private config;
    private connectionManager;
    private queueManager;
    private messageProcessor;
    private retryManager;
    constructor(config: BusConfig, consumeCallback: ConsumeMessageCallback);
    /**
     * Connect to RabbitMQ and setup queues
     */
    connect(): Promise<void>;
    /**
     * Start consuming a message type
     */
    consumeType(type: string): Promise<void>;
    /**
     * Stop consuming a message type
     */
    removeType(type: string): Promise<void>;
    /**
     * Send a message to specific endpoint(s)
     */
    send<T extends Message>(endpoint: string | string[], type: string, message: T, headers: MessageHeaders): Promise<void>;
    /**
     * Publish a message to an exchange
     */
    publish<T extends Message>(type: string, message: T, headers: MessageHeaders): Promise<void>;
    /**
     * Close the connection gracefully
     */
    close(): Promise<void>;
    /**
     * Check if connected
     */
    isConnected(): Promise<boolean>;
    /**
     * Build message headers with defaults
     */
    private buildHeaders;
}
//# sourceMappingURL=index.d.ts.map