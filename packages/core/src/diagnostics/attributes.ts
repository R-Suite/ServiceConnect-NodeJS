import type { Attributes } from '@opentelemetry/api';
import {
    ATTR_MESSAGING_SYSTEM,
    ATTR_PROTOCOL_NAME,
    ATTR_SERVER_ADDRESS,
    ATTR_SERVER_PORT,
    DEFAULT_MESSAGING_SYSTEM,
    DEFAULT_PROTOCOL_NAME,
} from './conventions.js';

/** Identity of the messaging system and broker endpoint, shared by metric tags and span attributes. */
export interface MessagingSystemAttributes {
    /** messaging.system value. Defaults to `rabbitmq`. */
    readonly system?: string;
    /** network.protocol.name value. Defaults to `amqp`. */
    readonly protocolName?: string;
    /** Broker host for server.address. Omitted when unset. */
    readonly serverAddress?: string;
    /** Broker port for server.port. Omitted when not a positive number. */
    readonly serverPort?: number;
}

/**
 * Builds the constant messaging.system / network.protocol.name / server.* attribute set used by
 * both transport metrics and telemetry spans. Single source of truth so the two never drift; the
 * result is constant per producer/consumer, so callers should build it once rather than per message.
 */
export function messagingSystemAttributes(sys?: MessagingSystemAttributes): Attributes {
    const attrs: Attributes = {
        [ATTR_MESSAGING_SYSTEM]: sys?.system ?? DEFAULT_MESSAGING_SYSTEM,
        [ATTR_PROTOCOL_NAME]: sys?.protocolName ?? DEFAULT_PROTOCOL_NAME,
    };
    if (sys?.serverAddress) {
        attrs[ATTR_SERVER_ADDRESS] = sys.serverAddress;
    }
    if (typeof sys?.serverPort === 'number' && sys.serverPort > 0) {
        attrs[ATTR_SERVER_PORT] = sys.serverPort;
    }
    return attrs;
}
