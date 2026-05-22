import type { Message } from './message.js';

export class ServiceConnectError extends Error {
  override readonly name: string = 'ServiceConnectError';
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
  }
}

export class ValidationError extends ServiceConnectError {
  override readonly name = 'ValidationError';
}

export class OutgoingFiltersBlockedError extends ServiceConnectError {
  override readonly name = 'OutgoingFiltersBlockedError';
}

export class HandlerNotRegisteredError extends ServiceConnectError {
  override readonly name = 'HandlerNotRegisteredError';
}

export class MessageTypeNotRegisteredError extends ServiceConnectError {
  override readonly name = 'MessageTypeNotRegisteredError';
}

export class TerminalDeserializationError extends ServiceConnectError {
  override readonly name = 'TerminalDeserializationError';
}

export class InvalidOperationError extends ServiceConnectError {
  override readonly name = 'InvalidOperationError';
}

export class RequestTimeoutError extends ServiceConnectError {
  override readonly name = 'RequestTimeoutError';
  readonly partialReplies: readonly Message[];
  constructor(message: string, partialReplies: readonly Message[] = []) {
    super(message);
    this.partialReplies = partialReplies;
  }
}

export class RequestSendCancelledError extends ServiceConnectError {
  override readonly name = 'RequestSendCancelledError';
}

export class AbortError extends ServiceConnectError {
  override readonly name = 'AbortError';
}

export class ArgumentError extends ServiceConnectError {
  override readonly name = 'ArgumentError';
}

export class ArgumentOutOfRangeError extends ServiceConnectError {
  override readonly name = 'ArgumentOutOfRangeError';
}

export class ConcurrencyError extends ServiceConnectError {
  override readonly name = 'ConcurrencyError';
}

export class DuplicateSagaError extends ServiceConnectError {
  override readonly name = 'DuplicateSagaError';
}
