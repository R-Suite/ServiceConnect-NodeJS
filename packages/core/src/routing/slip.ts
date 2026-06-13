export const ROUTING_SLIP_HEADER = 'RoutingSlip';

export function serialiseRoutingSlip(destinations: readonly string[]): string {
    return JSON.stringify([...destinations]);
}

export function parseRoutingSlip(headerValue: string | undefined): readonly string[] {
    if (!headerValue) return [];
    const parsed: unknown = JSON.parse(headerValue);
    if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === 'string')) {
        throw new Error('RoutingSlip header must encode a string array');
    }
    return parsed;
}
