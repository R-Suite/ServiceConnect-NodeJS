import { describe, expect, it } from 'vitest';
import {
    AbortError,
    ArgumentError,
    ArgumentOutOfRangeError,
    HandlerNotRegisteredError,
    MessageTypeNotRegisteredError,
    OutgoingFiltersBlockedError,
    RequestSendCancelledError,
    RequestTimeoutError,
    RoutingSlipDestinationError,
    ServiceConnectError,
    StreamFaultedError,
    StreamSequenceError,
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

    it('RequestTimeoutError carries partialReplies', () => {
        const partial = [{ correlationId: 'c' }, { correlationId: 'c2' }];
        const err = new RequestTimeoutError('timed out', partial);
        expect(err).toBeInstanceOf(ServiceConnectError);
        expect(err.name).toBe('RequestTimeoutError');
        expect(err.partialReplies).toEqual(partial);
    });

    it('RequestTimeoutError defaults partialReplies to empty array', () => {
        const err = new RequestTimeoutError('timed out');
        expect(err.partialReplies).toEqual([]);
    });

    it('RequestSendCancelledError preserves cause', () => {
        const cause = new Error('transport down');
        const err = new RequestSendCancelledError('send failed', cause);
        expect(err.name).toBe('RequestSendCancelledError');
        expect(err.cause).toBe(cause);
    });

    it('AbortError is a ServiceConnectError', () => {
        const err = new AbortError('aborted');
        expect(err).toBeInstanceOf(ServiceConnectError);
        expect(err.name).toBe('AbortError');
    });

    it('ArgumentError and ArgumentOutOfRangeError are distinct ServiceConnectErrors', () => {
        const a = new ArgumentError('bad arg');
        const b = new ArgumentOutOfRangeError('out of range');
        expect(a.name).toBe('ArgumentError');
        expect(b.name).toBe('ArgumentOutOfRangeError');
        expect(a).toBeInstanceOf(ServiceConnectError);
        expect(b).toBeInstanceOf(ServiceConnectError);
    });
});

describe('routing-slip and stream errors', () => {
    it('RoutingSlipDestinationError extends ServiceConnectError', () => {
        const err = new RoutingSlipDestinationError('bad destination');
        expect(err).toBeInstanceOf(ServiceConnectError);
        expect(err.name).toBe('RoutingSlipDestinationError');
    });

    it('StreamFaultedError extends ServiceConnectError', () => {
        const err = new StreamFaultedError('faulted');
        expect(err).toBeInstanceOf(ServiceConnectError);
        expect(err.name).toBe('StreamFaultedError');
    });

    it('StreamSequenceError extends ServiceConnectError', () => {
        const err = new StreamSequenceError('gap detected');
        expect(err).toBeInstanceOf(ServiceConnectError);
        expect(err.name).toBe('StreamSequenceError');
    });
});
