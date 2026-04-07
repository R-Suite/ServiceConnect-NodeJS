"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValidationErrorCodes = exports.ValidationError = void 0;
const ServiceConnectError_1 = require("./ServiceConnectError");
/**
 * Error thrown when configuration validation fails.
 * Never retryable - indicates programming error or bad configuration.
 */
class ValidationError extends ServiceConnectError_1.ServiceConnectError {
    /**
     * Configuration field that failed validation
     */
    field;
    constructor(message, code, field) {
        // Validation errors are never retryable
        super(message, code, false, undefined);
        this.name = 'ValidationError';
        if (field !== undefined) {
            this.field = field;
        }
    }
}
exports.ValidationError = ValidationError;
/**
 * Predefined validation error codes
 */
exports.ValidationErrorCodes = {
    CONFIG_MISSING_QUEUE_NAME: 'CONFIG_MISSING_QUEUE_NAME',
    CONFIG_INVALID_MAX_RETRIES: 'CONFIG_INVALID_MAX_RETRIES',
    CONFIG_INVALID_RETRY_DELAY: 'CONFIG_INVALID_RETRY_DELAY',
    CONFIG_MISSING_HOST: 'CONFIG_MISSING_HOST',
    CONFIG_INVALID_PREFETCH: 'CONFIG_INVALID_PREFETCH',
    CONFIG_INVALID_SSL: 'CONFIG_INVALID_SSL',
    INVALID_ENDPOINT: 'INVALID_ENDPOINT',
    INVALID_MESSAGE_TYPE: 'INVALID_MESSAGE_TYPE'
};
//# sourceMappingURL=ValidationError.js.map