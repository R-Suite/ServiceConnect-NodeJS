import type { ChannelWrapper } from 'amqp-connection-manager';
import type { ConsumeMessage, ConfirmChannel } from 'amqplib';
import type { BusConfig } from '../../types';
interface ProcessingResult {
    success: boolean;
    exception?: unknown;
}
/**
 * Manages message retry logic and dead lettering.
 */
export declare class RetryManager {
    private config;
    constructor(config: BusConfig);
    /**
     * Handle message processing result - retry or send to error queue
     */
    handleResult(channel: ChannelWrapper, rawMessage: ConsumeMessage, result: ProcessingResult): Promise<void>;
    /**
     * Handle successful processing
     */
    private handleSuccess;
    /**
     * Handle failed processing - retry or error queue
     */
    private handleFailure;
    /**
     * Send message to error queue
     */
    private sendToErrorQueue;
    /**
     * Delete the retry queue during cleanup
     */
    cleanup(channel: ConfirmChannel): Promise<void>;
}
export {};
//# sourceMappingURL=retry-manager.d.ts.map