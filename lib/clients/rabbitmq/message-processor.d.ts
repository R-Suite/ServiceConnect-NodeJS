import type { ConfirmChannel } from 'amqplib';
import type { ChannelWrapper } from 'amqp-connection-manager';
import type { BusConfig, ConsumeMessageCallback } from '../../types';
import { RetryManager } from './retry-manager';
/**
 * Processes incoming RabbitMQ messages with error handling.
 */
export declare class MessageProcessor {
    private config;
    private consumeCallback;
    private retryManager;
    private logger;
    private processing;
    private channel;
    private channelWrapper;
    constructor(config: BusConfig, consumeCallback: ConsumeMessageCallback, retryManager: RetryManager);
    /**
     * Start consuming messages from the queue
     */
    startConsuming(channel: ConfirmChannel, channelWrapper?: ChannelWrapper): Promise<void>;
    /**
     * Handle incoming message
     */
    private handleMessage;
    /**
     * Process the message content
     */
    private processMessage;
    /**
     * Acknowledge message if noAck is false
     */
    private ackMessage;
    /**
     * Get count of messages currently being processed
     */
    getProcessingCount(): number;
    /**
     * Wait for all messages to finish processing
     */
    waitForProcessing(timeoutMs?: number): Promise<void>;
    /**
     * Sleep utility
     */
    private sleep;
}
//# sourceMappingURL=message-processor.d.ts.map