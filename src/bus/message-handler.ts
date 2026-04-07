import type { Message, MessageHandler, HandlersConfig } from '../types';

/**
 * Manages message handler registration and lookup.
 */
export class MessageHandlerManager {
  private handlers: HandlersConfig = {};

  /**
   * Normalize a type name by removing dots, except for the wildcard '*'.
   */
  private normalizeType(messageType: string): string {
    if (messageType === '*') {
      return messageType;
    }
    return messageType.replaceAll('.', '');
  }

  /**
   * Add a handler for a message type
   * @param messageType - The message type to handle
   * @param handler - The handler function
   */
  addHandler<T extends Message>(
    messageType: string,
    handler: MessageHandler<T>
  ): void {
    const normalized = this.normalizeType(messageType);
    if (!this.handlers[normalized]) {
      this.handlers[normalized] = [];
    }
    this.handlers[normalized].push(handler as MessageHandler<Message>);
  }

  /**
   * Remove a handler for a message type
   * @param messageType - The message type
   * @param handler - The handler function to remove
   * @returns True if handler was found and removed
   */
  removeHandler<T extends Message>(
    messageType: string,
    handler: MessageHandler<T>
  ): boolean {
    const normalized = this.normalizeType(messageType);
    const handlers = this.handlers[normalized];
    if (!handlers) {
      return false;
    }

    const index = handlers.indexOf(handler as MessageHandler<Message>);
    if (index === -1) {
      return false;
    }

    handlers.splice(index, 1);
    if (handlers.length === 0) {
      delete this.handlers[normalized];
    }
    return true;
  }

  /**
   * Check if a message type has any handlers
   * @param messageType - The message type to check
   */
  isHandled(messageType: string): boolean {
    const normalized = this.normalizeType(messageType);
    const handlers = this.handlers[normalized];
    return handlers !== undefined && handlers.length > 0;
  }

  /**
   * Get all handlers for a message type, including wildcard handlers
   * @param messageType - The message type
   * @returns Array of handlers
   */
  getHandlers(messageType: string): MessageHandler<Message>[] {
    const normalized = this.normalizeType(messageType);
    const specific = this.handlers[normalized] || [];
    const wildcard = this.handlers['*'] || [];
    return [...specific, ...wildcard];
  }

  /**
   * Get the number of handlers for a message type
   * @param messageType - The message type
   */
  getHandlerCount(messageType: string): number {
    return this.getHandlers(messageType).length;
  }

  /**
   * Check if a message type has no handlers (for cleanup)
   * @param messageType - The message type
   */
  hasNoHandlers(messageType: string): boolean {
    const normalized = this.normalizeType(messageType);
    const handlers = this.handlers[normalized];
    return handlers === undefined || handlers.length === 0;
  }

  /**
   * Get the raw handlers config (for client initialization)
   */
  getHandlersConfig(): HandlersConfig {
    return { ...this.handlers };
  }

  /**
   * Initialize handlers from config (for restoring state).
   * Normalizes type names to ensure consistent lookup.
   * @param config - Handlers configuration
   */
  initializeFromConfig(config: HandlersConfig): void {
    this.handlers = {};
    for (const key of Object.keys(config)) {
      const normalized = this.normalizeType(key);
      const sourceHandlers = config[key] ?? [];
      // Merge handlers if a dotted and non-dotted key would collide
      if (this.handlers[normalized]) {
        this.handlers[normalized].push(...sourceHandlers);
      } else {
        this.handlers[normalized] = [...sourceHandlers];
      }
    }
  }
}
