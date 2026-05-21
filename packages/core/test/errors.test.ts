import { describe, expect, it } from 'vitest';
import {
  HandlerNotRegisteredError,
  MessageTypeNotRegisteredError,
  OutgoingFiltersBlockedError,
  ServiceConnectError,
  TerminalDeserializationError,
  ValidationError,
} from '../src/errors.js';

describe('errors', () => {
  it('ServiceConnectError carries cause', () => {
    const cause = new Error('inner');
    const err = new ServiceConnectError('outer', cause);
    expect(err.message).toBe('outer');
    expect(err.cause).toBe(cause);
    expect(err.name).toBe('ServiceConnectError');
    expect(err instanceof Error).toBe(true);
  });

  it('subclasses set their own name and remain instanceof ServiceConnectError', () => {
    const subclasses: Array<[new (msg: string) => ServiceConnectError, string]> = [
      [ValidationError, 'ValidationError'],
      [OutgoingFiltersBlockedError, 'OutgoingFiltersBlockedError'],
      [HandlerNotRegisteredError, 'HandlerNotRegisteredError'],
      [MessageTypeNotRegisteredError, 'MessageTypeNotRegisteredError'],
      [TerminalDeserializationError, 'TerminalDeserializationError'],
    ];
    for (const [Ctor, name] of subclasses) {
      const err = new Ctor('msg');
      expect(err.name).toBe(name);
      expect(err.message).toBe('msg');
      expect(err instanceof ServiceConnectError).toBe(true);
      expect(err instanceof Error).toBe(true);
    }
  });
});
