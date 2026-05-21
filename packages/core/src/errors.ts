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
