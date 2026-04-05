import { ServiceConnectError } from './ServiceConnectError';
/**
 * Error thrown when configuration validation fails.
 * Never retryable - indicates programming error or bad configuration.
 */
export declare class ValidationError extends ServiceConnectError {
    /**
     * Configuration field that failed validation
     */
    readonly field?: string;
    constructor(message: string, code: string, field?: string);
}
/**
 * Predefined validation error codes
 */
export declare const ValidationErrorCodes: {
    readonly CONFIG_MISSING_QUEUE_NAME: "CONFIG_MISSING_QUEUE_NAME";
    readonly CONFIG_INVALID_MAX_RETRIES: "CONFIG_INVALID_MAX_RETRIES";
    readonly CONFIG_INVALID_RETRY_DELAY: "CONFIG_INVALID_RETRY_DELAY";
    readonly CONFIG_MISSING_HOST: "CONFIG_MISSING_HOST";
    readonly CONFIG_INVALID_PREFETCH: "CONFIG_INVALID_PREFETCH";
    readonly CONFIG_INVALID_SSL: "CONFIG_INVALID_SSL";
};
//# sourceMappingURL=ValidationError.d.ts.map