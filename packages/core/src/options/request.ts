export interface RequestOptions {
  readonly headers?: Readonly<Record<string, string>>;
  readonly endpoint?: string;
  readonly timeoutMs?: number;
  readonly expectedReplyCount?: number;
}

export const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
