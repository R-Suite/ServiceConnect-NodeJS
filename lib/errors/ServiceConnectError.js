"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServiceConnectError = void 0;
/**
 * Base error class for all ServiceConnect errors.
 * Provides common properties for error classification and handling.
 */
class ServiceConnectError extends Error {
    /**
     * Error code for programmatic handling
     */
    code;
    /**
     * Whether this error is retryable (transient)
     */
    isRetryable;
    /**
     * Timestamp when the error occurred
     */
    timestamp;
    /**
     * Original error that caused this error (if any)
     */
    cause;
    /**
     * Creates a new ServiceConnectError
     * @param message - Human-readable error message
     * @param code - Error code for programmatic handling
     * @param isRetryable - Whether the operation can be retried
     * @param cause - Original error that caused this error
     */
    constructor(message, code, isRetryable = false, cause) {
        super(message);
        this.name = 'ServiceConnectError';
        this.code = code;
        this.isRetryable = isRetryable;
        this.timestamp = new Date();
        if (cause !== undefined) {
            this.cause = cause;
        }
        // Maintain proper stack trace in V8 environments
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, ServiceConnectError);
        }
    }
    /**
     * Returns a JSON representation of the error
     */
    toJSON() {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            isRetryable: this.isRetryable,
            timestamp: this.timestamp.toISOString(),
            stack: this.stack,
            cause: this.cause?.message
        };
    }
}
exports.ServiceConnectError = ServiceConnectError;
//# sourceMappingURL=ServiceConnectError.js.map