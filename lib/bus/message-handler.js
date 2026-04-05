"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageHandlerManager = void 0;
/**
 * Manages message handler registration and lookup.
 */
class MessageHandlerManager {
    handlers = {};
    /**
     * Add a handler for a message type
     * @param messageType - The message type to handle
     * @param handler - The handler function
     */
    addHandler(messageType, handler) {
        if (!this.handlers[messageType]) {
            this.handlers[messageType] = [];
        }
        this.handlers[messageType].push(handler);
    }
    /**
     * Remove a handler for a message type
     * @param messageType - The message type
     * @param handler - The handler function to remove
     * @returns True if handler was found and removed
     */
    removeHandler(messageType, handler) {
        const handlers = this.handlers[messageType];
        if (!handlers) {
            return false;
        }
        const index = handlers.indexOf(handler);
        if (index === -1) {
            return false;
        }
        handlers.splice(index, 1);
        return true;
    }
    /**
     * Check if a message type has any handlers
     * @param messageType - The message type to check
     */
    isHandled(messageType) {
        const handlers = this.handlers[messageType];
        return handlers !== undefined && handlers.length > 0;
    }
    /**
     * Get all handlers for a message type, including wildcard handlers
     * @param messageType - The message type
     * @returns Array of handlers
     */
    getHandlers(messageType) {
        const specific = this.handlers[messageType] || [];
        const wildcard = this.handlers['*'] || [];
        return [...specific, ...wildcard];
    }
    /**
     * Get the number of handlers for a message type
     * @param messageType - The message type
     */
    getHandlerCount(messageType) {
        return this.getHandlers(messageType).length;
    }
    /**
     * Check if a message type has no handlers (for cleanup)
     * @param messageType - The message type
     */
    hasNoHandlers(messageType) {
        const handlers = this.handlers[messageType];
        return handlers === undefined || handlers.length === 0;
    }
    /**
     * Get the raw handlers config (for client initialization)
     */
    getHandlersConfig() {
        return { ...this.handlers };
    }
    /**
     * Initialize handlers from config (for restoring state)
     * @param config - Handlers configuration
     */
    initializeFromConfig(config) {
        this.handlers = { ...config };
    }
}
exports.MessageHandlerManager = MessageHandlerManager;
//# sourceMappingURL=message-handler.js.map