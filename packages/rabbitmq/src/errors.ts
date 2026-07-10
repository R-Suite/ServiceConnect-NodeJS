import { ServiceConnectError } from '@serviceconnect/core';

export class RabbitMQPayloadTooLargeError extends ServiceConnectError {
    override readonly name = 'RabbitMQPayloadTooLargeError';
}

export class RabbitMQPublishConfirmTimeoutError extends ServiceConnectError {
    override readonly name = 'RabbitMQPublishConfirmTimeoutError';
}

export class RabbitMQTopologyMismatchError extends ServiceConnectError {
    override readonly name = 'RabbitMQTopologyMismatchError';
}
