/**
 * Base error class for all ServiceConnect errors.
 * Provides common properties for error classification and handling.
 */
export declare class ServiceConnectError extends Error {
    /**
     * Error code for programmatic handling
     */
    readonly code: string;
    /**
     * Whether this error is retryable (transient)
     */
    readonly isRetryable: boolean;
    /**
     * Timestamp when the error occurred
     */
    readonly timestamp: Date;
    /**
     * Original error that caused this error (if any)
     */
    readonly cause?: Error;
    /**
     * Creates a new ServiceConnectError
     * @param message - Human-readable error message
     * @param code - Error code for programmatic handling
     * @param isRetryable - Whether the operation can be retried
     * @param cause - Original error that caused this error
     */
    constructor(message: string, code: string, isRetryable?: boolean, cause?: Error);
    /**
     * Returns a JSON representation of the error
     */
    toJSON(): Record<string, unknown>;
}
//# sourceMappingURL=ServiceConnectError.d.ts.map