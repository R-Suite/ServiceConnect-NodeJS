import type { ServiceConnectConfig, BusConfig, Message, MessageHandler, MessageHeaders } from '../types';
/**
 * Bus class - main entry point for messaging operations.
 * Maintains backward-compatible public API while delegating to internal modules.
 */
export declare class Bus {
    id: string;
    initialized: boolean;
    client: null;
    config: BusConfig;
    private core;
    private handlerManager;
    private filterManager;
    private requestReplyManager;
    constructor(config: ServiceConnectConfig);
    /**
     * Validate user-provided configuration
     */
    private validateConfig;
    /**
     * Initialize the bus - creates client and connects to broker
     */
    init(): Promise<void>;
    /**
     * Add a handler for a message type
     */
    addHandler<T extends Message>(messageType: string, handler: MessageHandler<T>): Promise<void>;
    /**
     * Remove a handler for a message type
     */
    removeHandler<T extends Message>(messageType: string, handler: MessageHandler<T>): Promise<void>;
    /**
     * Check if a message type is being handled
     */
    isHandled(messageType: string): boolean;
    /**
     * Send a command to specified endpoint(s)
     */
    send<T extends Message>(endpoint: string | string[], type: string, message: T, headers?: Partial<MessageHeaders>): Promise<void>;
    /**
     * Publish an event of specified type
     */
    publish<T extends Message>(type: string, message: T, headers?: Partial<MessageHeaders>): Promise<void>;
    /**
     * Send a command and wait for reply
     */
    sendRequest<T1 extends Message, T2 extends Message>(endpoint: string | string[], type: string, message: T1, callback: MessageHandler<T2>, headers?: Partial<MessageHeaders>): Promise<void>;
    /**
     * Publish an event and wait for replies
     */
    publishRequest<T1 extends Message, T2 extends Message>(type: string, message: T1, callback: MessageHandler<T2>, expected?: number | null, timeout?: number | null, headers?: Partial<MessageHeaders>): Promise<void>;
    /**
     * Close the bus and cleanup
     */
    close(): Promise<void>;
    /**
     * Check if connected to broker
     */
    isConnected(): Promise<boolean>;
    /**
     * Internal callback for consuming messages from client
     */
    private consumeMessage;
    /**
     * Create a reply callback for handlers
     */
    private createReplyCallback;
}
//# sourceMappingURL=index.d.ts.map