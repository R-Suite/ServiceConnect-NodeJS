import { ServiceConnectError } from './ServiceConnectError';

/**
 * Error thrown when connection to message broker fails.
 * Typically retryable for transient network issues.
 */
export class ConnectionError extends ServiceConnectError {
  /**
   * Host that failed to connect (if known)
   */
  readonly host?: string;

  constructor(
    message: string,
    code: string,
    isRetryable: boolean = true,
    cause?: Error,
    host?: string
  ) {
    super(message, code, isRetryable, cause);
    this.name = 'ConnectionError';
    this.host = host;
  }
}

/**
 * Predefined connection error codes
 */
export const ConnectionErrorCodes = {
  CONNECTION_FAILED: 'CONNECTION_FAILED',
  CONNECTION_LOST: 'CONNECTION_LOST',
  CONNECTION_TIMEOUT: 'CONNECTION_TIMEOUT',
  AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',
  HOST_UNREACHABLE: 'HOST_UNREACHABLE',
  CHANNEL_CLOSED: 'CHANNEL_CLOSED'
} as const;
