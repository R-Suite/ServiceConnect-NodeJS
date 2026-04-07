import type { Message, MessageHandler } from '../types';
/**
 * Manages request/reply state for pending requests.
 * Tracks callbacks, timeouts, and completion counts.
 */
export declare class RequestReplyManager {
    private callbacks;
    /**
     * Register a new request for reply tracking
     * @param messageId - Unique message ID for this request
     * @param endpointCount - Number of expected replies
     * @param callback - Handler to call when reply arrives
     * @param timeoutMs - Optional timeout in milliseconds
     */
    registerRequest(messageId: string, endpointCount: number, callback: MessageHandler<Message>, timeoutMs: number | null): void;
    /**
     * Process a reply message and invoke the callback if found
     * @param messageId - The response message ID
     * @param message - The reply message
     * @param headers - Message headers
     * @param type - Message type
     * @returns Promise that resolves when callback completes
     */
    processReply(messageId: string, message: Message, headers: Record<string, unknown>, type: string): Promise<void>;
    /**
     * Check if a request is still pending
     * @param messageId - The message ID to check
     */
    hasPendingRequest(messageId: string): boolean;
    /**
     * Get the number of pending requests
     */
    getPendingCount(): number;
    /**
     * Clean up all pending requests and their timeouts
     */
    cleanupAll(): void;
    /**
     * Clean up a specific request
     * @param messageId - The message ID to clean up
     */
    private cleanupRequest;
}
//# sourceMappingURL=request-reply-manager.d.ts.map