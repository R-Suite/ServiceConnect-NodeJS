import { ServiceConnectError } from './ServiceConnectError';

/**
 * Error thrown during message processing.
 * May be retryable depending on the nature of the failure.
 */
export class MessageError extends ServiceConnectError {
  /**
   * Message type that failed (if known)
   */
  readonly messageType?: string;

  /**
   * Message ID that failed (if known)
   */
  readonly messageId?: string;

  constructor(
    message: string,
    code: string,
    isRetryable: boolean = false,
    cause?: Error,
    messageType?: string,
    messageId?: string
  ) {
    super(message, code, isRetryable, cause);
    this.name = 'MessageError';
    if (messageType !== undefined) {
      (this as { messageType: string }).messageType = messageType;
    }
    if (messageId !== undefined) {
      (this as { messageId: string }).messageId = messageId;
    }
  }
}

/**
 * Predefined message error codes
 */
export const MessageErrorCodes = {
  INVALID_MESSAGE_FORMAT: 'INVALID_MESSAGE_FORMAT',
  MESSAGE_PARSE_ERROR: 'MESSAGE_PARSE_ERROR',
  MISSING_TYPE_NAME: 'MISSING_TYPE_NAME',
  HANDLER_FAILED: 'HANDLER_FAILED',
  PUBLISH_FAILED: 'PUBLISH_FAILED',
  SEND_FAILED: 'SEND_FAILED'
} as const;
