import { RoutingSlipDestinationError } from '../errors.js';

const MAX_LENGTH = 128;
const FORBIDDEN_CHARS = ['*', '#', '\0', '\r', '\n', '\t', '"', "'"];

export function destinationFailureReason(destination: string | undefined): string | null {
    if (!destination || destination.trim().length === 0) {
        return 'destination is null or whitespace';
    }
    if (destination.length > MAX_LENGTH) {
        return `destination exceeds the ${MAX_LENGTH}-character cap`;
    }
    for (const ch of FORBIDDEN_CHARS) {
        if (destination.includes(ch)) {
            return 'destination contains a reserved character (one of *, #, NUL, CR, LF, TAB, ", \')';
        }
    }
    if (destination.toLowerCase().startsWith('amq.')) {
        return "destination is in the AMQP reserved 'amq.*' namespace";
    }
    return null;
}

export function isValidDestination(destination: string | undefined): boolean {
    return destinationFailureReason(destination) === null;
}

export function assertValidDestination(destination: string | undefined): void {
    const reason = destinationFailureReason(destination);
    if (reason !== null) {
        throw new RoutingSlipDestinationError(reason);
    }
}
