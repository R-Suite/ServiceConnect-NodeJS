import type { ConfirmChannel } from 'amqplib';
import type { BusConfig, ConsumeMessageCallback } from '../../types';
/**
 * Processes incoming RabbitMQ messages with error handling.
 */
export declare class MessageProcessor {
    private config;
    private consumeCallback;
    private logger;
    private processing;
    constructor(config: BusConfig, consumeCallback: ConsumeMessageCallback);
    /**
     * Start consuming messages from the queue
     */
    startConsuming(channel: ConfirmChannel): Promise<void>;
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