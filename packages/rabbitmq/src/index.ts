import type { Message } from '@serviceconnect/core';
import { PACKAGE_NAME as CORE_NAME } from '@serviceconnect/core';

export const PACKAGE_NAME = '@serviceconnect/rabbitmq' as const;
export const CORE_DEPENDENCY = CORE_NAME;

/**
 * Phase A inter-package probe extended in Phase B: prove the Message type export resolves
 * downstream. Real RabbitMQ implementation lands in Phase C.
 */
export type RabbitMQMessage = Message;
