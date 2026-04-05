import { ServiceConnectError } from './ServiceConnectError';
/**
 * Error thrown when connection to message broker fails.
 * Typically retryable for transient network issues.
 */
export declare class ConnectionError extends ServiceConnectError {
    /**
     * Host that failed to connect (if known)
     */
    readonly host?: string;
    constructor(message: string, code: string, isRetryable?: boolean, cause?: Error, host?: string);
}
/**
 * Predefined connection error codes
 */
export declare const ConnectionErrorCodes: {
    readonly CONNECTION_FAILED: "CONNECTION_FAILED";
    readonly CONNECTION_LOST: "CONNECTION_LOST";
    readonly CONNECTION_TIMEOUT: "CONNECTION_TIMEOUT";
    readonly AUTHENTICATION_FAILED: "AUTHENTICATION_FAILED";
    readonly HOST_UNREACHABLE: "HOST_UNREACHABLE";
    readonly CHANNEL_CLOSED: "CHANNEL_CLOSED";
};
//# sourceMappingURL=ConnectionError.d.ts.map