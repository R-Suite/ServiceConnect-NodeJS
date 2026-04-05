import { ServiceConnectError } from './ServiceConnectError';
/**
 * Error thrown during message processing.
 * May be retryable depending on the nature of the failure.
 */
export declare class MessageError extends ServiceConnectError {
    /**
     * Message type that failed (if known)
     */
    readonly messageType?: string;
    /**
     * Message ID that failed (if known)
     */
    readonly messageId?: string;
    constructor(message: string, code: string, isRetryable?: boolean, cause?: Error, messageType?: string, messageId?: string);
}
/**
 * Predefined message error codes
 */
export declare const MessageErrorCodes: {
    readonly INVALID_MESSAGE_FORMAT: "INVALID_MESSAGE_FORMAT";
    readonly MESSAGE_PARSE_ERROR: "MESSAGE_PARSE_ERROR";
    readonly MISSING_TYPE_NAME: "MISSING_TYPE_NAME";
    readonly HANDLER_FAILED: "HANDLER_FAILED";
    readonly PUBLISH_FAILED: "PUBLISH_FAILED";
    readonly SEND_FAILED: "SEND_FAILED";
};
//# sourceMappingURL=MessageError.d.ts.map