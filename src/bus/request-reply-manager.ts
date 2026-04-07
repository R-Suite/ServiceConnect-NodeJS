import type { Message, MessageHandler, RequestReplyCallback } from '../types';

/**
 * Manages request/reply state for pending requests.
 * Tracks callbacks, timeouts, completion counts, and deduplicates retried replies.
 */
export class RequestReplyManager {
  private callbacks: Map<string, RequestReplyCallback<Message>> = new Map();
  private processedSources: Map<string, Set<string>> = new Map();

  /**
   * Register a new request for reply tracking
   * @param messageId - Unique message ID for this request
   * @param endpointCount - Number of expected replies (-1 for scatter-gather)
   * @param callback - Handler to call when reply arrives
   * @param timeoutMs - Optional timeout in milliseconds
   * @param defaultTimeoutMs - Fallback timeout when endpointCount is -1 and no explicit timeout
   */
  registerRequest(
    messageId: string,
    endpointCount: number,
    callback: MessageHandler<Message>,
    timeoutMs: number | null,
    defaultTimeoutMs: number = 30000
  ): void {
    const requestConfig: RequestReplyCallback<Message> = {
      endpointCount,
      processedCount: 0,
      callback
    };

    // When endpointCount is unknown (-1, scatter-gather), enforce a timeout
    // to prevent leaking Map entries forever
    const effectiveTimeout = timeoutMs ?? (endpointCount < 0 ? Math.max(defaultTimeoutMs, 30000) : null);

    if (effectiveTimeout !== null && effectiveTimeout > 0) {
      requestConfig.timeout = setTimeout(() => {
        // Guard: if request was already processed, don't fire timeout callback
        if (!this.callbacks.has(messageId)) {
          return;
        }
        // Clean up first to prevent race with processReply
        this.cleanupRequest(messageId);
        const timeoutMessage = { timedOut: true, messageId } as unknown as Message;
        const timeoutHeaders = { ResponseMessageId: messageId, timedOut: true } as Record<string, unknown>;
        // Catch async callback errors to prevent unhandled promise rejections
        Promise.resolve(callback(timeoutMessage, timeoutHeaders, 'Timeout')).catch(() => {
          // Timeout callback errors are intentionally swallowed — the request is already cleaned up
        });
      }, effectiveTimeout);
    }

    this.callbacks.set(messageId, requestConfig);
    this.processedSources.set(messageId, new Set());
  }

  /**
   * Process a reply message and invoke the callback if found.
   * Deduplicates retried replies by SourceAddress and only increments
   * processedCount after the callback succeeds.
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

    // Deduplicate retried replies by source address
    const sourceAddress = (headers.SourceAddress as string) ?? '';
    const sources = this.processedSources.get(messageId);
    if (sources && sourceAddress && sources.has(sourceAddress)) {
      return;
    }

    // Invoke callback first — only increment count if it succeeds
    await config.callback(message, headers, type);

    config.processedCount++;
    if (sources && sourceAddress) {
      sources.add(sourceAddress);
    }

    const isComplete = config.endpointCount >= 0 && config.processedCount >= config.endpointCount;
    if (isComplete) {
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
    for (const [_messageId, config] of this.callbacks) {
      if (config.timeout) {
        clearTimeout(config.timeout);
      }
    }
    this.callbacks.clear();
    this.processedSources.clear();
  }

  /**
   * Clean up a specific request
   * @param messageId - The message ID to clean up
   */
  cleanupRequest(messageId: string): void {
    const config = this.callbacks.get(messageId);
    if (config?.timeout) {
      clearTimeout(config.timeout);
    }
    this.callbacks.delete(messageId);
    this.processedSources.delete(messageId);
  }
}
