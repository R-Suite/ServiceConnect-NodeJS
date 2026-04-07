/**
 * Base error class for all ServiceConnect errors.
 * Provides common properties for error classification and handling.
 */
export class ServiceConnectError extends Error {
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
  override readonly cause?: Error;

  /**
   * Creates a new ServiceConnectError
   * @param message - Human-readable error message
   * @param code - Error code for programmatic handling
   * @param isRetryable - Whether the operation can be retried
   * @param cause - Original error that caused this error
   */
  constructor(
    message: string,
    code: string,
    isRetryable: boolean = false,
    cause?: Error
  ) {
    super(message);
    this.name = 'ServiceConnectError';
    this.code = code;
    this.isRetryable = isRetryable;
    this.timestamp = new Date();
    if (cause !== undefined) {
      (this as { cause: Error }).cause = cause;
    }

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, new.target);
    }
  }

  /**
   * Returns a JSON representation of the error
   */
  toJSON(): Record<string, unknown> {
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
