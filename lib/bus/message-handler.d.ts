import type { Message, MessageHandler, HandlersConfig } from '../types';
/**
 * Manages message handler registration and lookup.
 */
export declare class MessageHandlerManager {
    private handlers;
    /**
     * Add a handler for a message type
     * @param messageType - The message type to handle
     * @param handler - The handler function
     */
    addHandler<T extends Message>(messageType: string, handler: MessageHandler<T>): void;
    /**
     * Remove a handler for a message type
     * @param messageType - The message type
     * @param handler - The handler function to remove
     * @returns True if handler was found and removed
     */
    removeHandler<T extends Message>(messageType: string, handler: MessageHandler<T>): boolean;
    /**
     * Check if a message type has any handlers
     * @param messageType - The message type to check
     */
    isHandled(messageType: string): boolean;
    /**
     * Get all handlers for a message type, including wildcard handlers
     * @param messageType - The message type
     * @returns Array of handlers
     */
    getHandlers(messageType: string): MessageHandler<Message>[];
    /**
     * Get the number of handlers for a message type
     * @param messageType - The message type
     */
    getHandlerCount(messageType: string): number;
    /**
     * Check if a message type has no handlers (for cleanup)
     * @param messageType - The message type
     */
    hasNoHandlers(messageType: string): boolean;
    /**
     * Get the raw handlers config (for client initialization)
     */
    getHandlersConfig(): HandlersConfig;
    /**
     * Initialize handlers from config (for restoring state)
     * @param config - Handlers configuration
     */
    initializeFromConfig(config: HandlersConfig): void;
}
//# sourceMappingURL=message-handler.d.ts.map