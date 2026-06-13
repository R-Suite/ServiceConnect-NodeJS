import type { Envelope } from '../envelope.js';
import type { Logger } from '../logger.js';
import type { MessageHeaders } from '../message.js';
import type { ITransportProducer } from '../transport.js';
import { ROUTING_SLIP_HEADER, parseRoutingSlip, serialiseRoutingSlip } from './slip.js';
import { destinationFailureReason } from './validator.js';

export interface ForwardOptions {
    envelope: Envelope;
    handlerSucceeded: boolean;
    producer: Pick<ITransportProducer, 'send'>;
    logger: Logger;
}

export async function forwardRoutingSlipIfPresent(opts: ForwardOptions): Promise<boolean> {
    if (!opts.handlerSucceeded) return false;

    const headers = opts.envelope.headers as MessageHeaders;
    const raw =
        typeof headers[ROUTING_SLIP_HEADER] === 'string'
            ? (headers[ROUTING_SLIP_HEADER] as string)
            : undefined;

    let slip: readonly string[];
    try {
        slip = parseRoutingSlip(raw);
    } catch (err) {
        opts.logger.warn('routing slip header is malformed; dropping forward', {
            error: err instanceof Error ? err.message : String(err),
        });
        return false;
    }
    if (slip.length === 0) return false;

    const next = slip[0];
    if (next === undefined) return false;
    const reason = destinationFailureReason(next);
    if (reason !== null) {
        opts.logger.warn('routing slip next destination is invalid; dropping forward', {
            destination: next,
            reason,
        });
        return false;
    }

    const remaining = slip.slice(1);
    const messageType = typeof headers.messageType === 'string' ? headers.messageType : '';
    const outboundHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
        if (typeof v === 'string') outboundHeaders[k] = v;
    }
    outboundHeaders[ROUTING_SLIP_HEADER] = serialiseRoutingSlip(remaining);

    await opts.producer.send(next, messageType, opts.envelope.body, { headers: outboundHeaders });
    return true;
}
