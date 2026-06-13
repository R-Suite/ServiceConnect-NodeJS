import { ServiceConnectError } from '@serviceconnect/core';
import { describe, expect, it } from 'vitest';
import {
    RabbitMQPayloadTooLargeError,
    RabbitMQPublishConfirmTimeoutError,
    RabbitMQTopologyMismatchError,
} from '../../src/errors.js';

describe('errors', () => {
    it('RabbitMQPayloadTooLargeError extends ServiceConnectError', () => {
        const err = new RabbitMQPayloadTooLargeError('too big');
        expect(err).toBeInstanceOf(ServiceConnectError);
        expect(err).toBeInstanceOf(Error);
        expect(err.name).toBe('RabbitMQPayloadTooLargeError');
        expect(err.message).toBe('too big');
    });

    it('RabbitMQPublishConfirmTimeoutError extends ServiceConnectError', () => {
        const cause = new Error('underlying');
        const err = new RabbitMQPublishConfirmTimeoutError('no ack', cause);
        expect(err).toBeInstanceOf(ServiceConnectError);
        expect(err.name).toBe('RabbitMQPublishConfirmTimeoutError');
        expect(err.cause).toBe(cause);
    });

    it('RabbitMQTopologyMismatchError extends ServiceConnectError', () => {
        const err = new RabbitMQTopologyMismatchError('x-arg differs on q-self');
        expect(err).toBeInstanceOf(ServiceConnectError);
        expect(err.name).toBe('RabbitMQTopologyMismatchError');
    });
});
