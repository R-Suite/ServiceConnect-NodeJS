import type { Message, MessageHandler, RequestReplyCallback } from '../types';

/**
 * Manages request/reply state for pending requests.
 * Tracks callbacks, timeouts, and completion counts.
 */
export class RequestReplyManager {
  private callbacks: Map<string, RequestReplyCallback<Message>> = new Map();

  /**
   * Register a new request for reply tracking
   * @param messageId - Unique message ID for this request
   * @param endpointCount - Number of expected replies
   * @param callback - Handler to call when reply arrives
   * @param timeoutMs - Optional timeout in milliseconds
   */
  registerRequest(
    messageId: string,
    endpointCount: number,
    callback: MessageHandler<Message>,
    timeoutMs: number | null
  ): void {
    const config: RequestReplyCallback<Message> = {
      endpointCount,
      processedCount: 0,
      callback
    };

    if (timeoutMs !== null && timeoutMs > 0) {
      config.timeout = setTimeout(() => {
        this.cleanupRequest(messageId);
      }, timeoutMs);
    }

    this.callbacks.set(messageId, config);
  }

  /**
   * Process a reply message and invoke the callback if found
   * @param messageId - The response message ID
   * @param message - The reply message
   * @param headers - Message headers
   * @param type - Message type
   * @returns Promise that resolves when callback completes
   */
  async processReply(
    messageId: string,
    message: Message,
    headers: Record<string, unknown>,
    type: string
  ): Promise<void> {
    const config = this.callbacks.get(messageId);
    if (!config) {
      return;
    }

    await config.callback(message, headers, type);
    config.processedCount++;

    if (config.processedCount >= config.endpointCount) {
      this.cleanupRequest(messageId);
    }
  }

  /**
   * Check if a request is still pending
   * @param messageId - The message ID to check
   */
  hasPendingRequest(messageId: string): boolean {
    return this.callbacks.has(messageId);
  }

  /**
   * Get the number of pending requests
   */
  getPendingCount(): number {
    return this.callbacks.size;
  }

  /**
   * Clean up all pending requests and their timeouts
   */
  cleanupAll(): void {
    for (const [messageId, config] of this.callbacks) {
      if (config.timeout) {
        clearTimeout(config.timeout);
      }
    }
    this.callbacks.clear();
  }

  /**
   * Clean up a specific request
   * @param messageId - The message ID to clean up
   */
  private cleanupRequest(messageId: string): void {
    const config = this.callbacks.get(messageId);
    if (config?.timeout) {
      clearTimeout(config.timeout);
    }
    this.callbacks.delete(messageId);
  }
}
