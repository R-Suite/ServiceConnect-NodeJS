import { ServiceConnectError } from './ServiceConnectError';

/**
 * Error thrown when configuration validation fails.
 * Never retryable - indicates programming error or bad configuration.
 */
export class ValidationError extends ServiceConnectError {
  /**
   * Configuration field that failed validation
   */
  readonly field?: string;

  constructor(
    message: string,
    code: string,
    field?: string
  ) {
    // Validation errors are never retryable
    super(message, code, false, undefined);
    this.name = 'ValidationError';
    if (field !== undefined) {
      (this as { field: string }).field = field;
    }
  }
}

/**
 * Predefined validation error codes
 */
export const ValidationErrorCodes = {
  CONFIG_MISSING_QUEUE_NAME: 'CONFIG_MISSING_QUEUE_NAME',
  CONFIG_INVALID_MAX_RETRIES: 'CONFIG_INVALID_MAX_RETRIES',
  CONFIG_INVALID_RETRY_DELAY: 'CONFIG_INVALID_RETRY_DELAY',
  CONFIG_MISSING_HOST: 'CONFIG_MISSING_HOST',
  CONFIG_INVALID_PREFETCH: 'CONFIG_INVALID_PREFETCH',
  CONFIG_INVALID_SSL: 'CONFIG_INVALID_SSL'
} as const;
