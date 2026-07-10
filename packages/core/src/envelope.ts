export interface Envelope {
    headers: Record<string, unknown>;
    body: Uint8Array;
}
