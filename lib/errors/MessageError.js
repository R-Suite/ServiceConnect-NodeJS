"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageErrorCodes = exports.MessageError = void 0;
const ServiceConnectError_1 = require("./ServiceConnectError");
/**
 * Error thrown during message processing.
 * May be retryable depending on the nature of the failure.
 */
class MessageError extends ServiceConnectError_1.ServiceConnectError {
    /**
     * Message type that failed (if known)
     */
    messageType;
    /**
     * Message ID that failed (if known)
     */
    messageId;
    constructor(message, code, isRetryable = false, cause, messageType, messageId) {
        super(message, code, isRetryable, cause);
        this.name = 'MessageError';
        if (messageType !== undefined) {
            this.messageType = messageType;
        }
        if (messageId !== undefined) {
            this.messageId = messageId;
        }
    }
}
exports.MessageError = MessageError;
/**
 * Predefined message error codes
 */
exports.MessageErrorCodes = {
    INVALID_MESSAGE_FORMAT: 'INVALID_MESSAGE_FORMAT',
    MESSAGE_PARSE_ERROR: 'MESSAGE_PARSE_ERROR',
    MISSING_TYPE_NAME: 'MISSING_TYPE_NAME',
    HANDLER_FAILED: 'HANDLER_FAILED',
    PUBLISH_FAILED: 'PUBLISH_FAILED',
    SEND_FAILED: 'SEND_FAILED'
};
//# sourceMappingURL=MessageError.js.map