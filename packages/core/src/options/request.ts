export interface RequestOptions {
    readonly headers?: Readonly<Record<string, string>>;
    readonly endpoint?: string;
    readonly timeoutMs?: number;
    readonly expectedReplyCount?: number;
    /**
     * Caller-supplied AbortSignal. When the signal aborts before a reply arrives the request
     * rejects with `AbortError`. Added in Phase D.
     */
    readonly signal?: AbortSignal;
}

export const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
