"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionErrorCodes = exports.ConnectionError = void 0;
const ServiceConnectError_1 = require("./ServiceConnectError");
/**
 * Error thrown when connection to message broker fails.
 * Typically retryable for transient network issues.
 */
class ConnectionError extends ServiceConnectError_1.ServiceConnectError {
    /**
     * Host that failed to connect (if known)
     */
    host;
    constructor(message, code, isRetryable = true, cause, host) {
        super(message, code, isRetryable, cause);
        this.name = 'ConnectionError';
        if (host !== undefined) {
            this.host = host;
        }
    }
}
exports.ConnectionError = ConnectionError;
/**
 * Predefined connection error codes
 */
exports.ConnectionErrorCodes = {
    CONNECTION_FAILED: 'CONNECTION_FAILED',
    CONNECTION_LOST: 'CONNECTION_LOST',
    CONNECTION_TIMEOUT: 'CONNECTION_TIMEOUT',
    AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',
    HOST_UNREACHABLE: 'HOST_UNREACHABLE',
    CHANNEL_CLOSED: 'CHANNEL_CLOSED',
    NOT_CONNECTED: 'NOT_CONNECTED'
};
//# sourceMappingURL=ConnectionError.js.map