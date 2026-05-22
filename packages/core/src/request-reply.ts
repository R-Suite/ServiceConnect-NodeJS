import type { Envelope } from './envelope.js';
import { AbortError, RequestTimeoutError } from './errors.js';
import type { Message, MessageHeaders, MessageId } from './message.js';
import { newMessageId } from './message.js';

export interface SingleRequestRegistration<TReply extends Message> {
  readonly requestMessageId: MessageId;
  readonly promise: Promise<TReply>;
}

export interface MultiRequestRegistration<TReply extends Message> {
  readonly requestMessageId: MessageId;
  readonly promise: Promise<TReply[]>;
}

export interface CallbackRequestRegistration {
  readonly requestMessageId: MessageId;
  readonly promise: Promise<void>;
}

export interface RegisterSingleOptions {
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
}

export interface RegisterMultiOptions {
  readonly timeoutMs: number;
  readonly expectedReplyCount?: number;
  readonly signal?: AbortSignal;
}

interface PendingEntryBase {
  readonly requestMessageId: MessageId;
  settled: boolean;
  timeoutHandle: ReturnType<typeof setTimeout>;
  abortListener?: () => void;
  signal?: AbortSignal;
}

interface SinglePendingEntry<TReply extends Message> extends PendingEntryBase {
  readonly kind: 'single';
  resolveFn: (reply: TReply) => void;
  rejectFn: (error: Error) => void;
}

interface MultiPendingEntry<TReply extends Message> extends PendingEntryBase {
  readonly kind: 'multi';
  readonly expectedReplyCount: number | undefined;
  replies: TReply[];
  resolveFn: (replies: TReply[]) => void;
  rejectFn: (error: Error) => void;
}

interface CallbackPendingEntry<TReply extends Message> extends PendingEntryBase {
  readonly kind: 'callback';
  readonly expectedReplyCount: number | undefined;
  readonly onReply: (reply: TReply) => void;
  replies: TReply[];
  resolveFn: () => void;
  rejectFn: (error: Error) => void;
}

type PendingEntry =
  | SinglePendingEntry<Message>
  | MultiPendingEntry<Message>
  | CallbackPendingEntry<Message>;

export class RequestReplyManager {
  private readonly pending = new Map<MessageId, PendingEntry>();

  registerSingle<TReply extends Message>(
    options: RegisterSingleOptions,
  ): SingleRequestRegistration<TReply> {
    const requestMessageId = newMessageId();

    let resolveFn!: (reply: TReply) => void;
    let rejectFn!: (error: Error) => void;
    const promise = new Promise<TReply>((resolve, reject) => {
      resolveFn = resolve;
      rejectFn = reject;
    });

    if (options.signal?.aborted) {
      rejectFn(new AbortError('request aborted'));
      return { requestMessageId, promise };
    }

    const entry: SinglePendingEntry<Message> = {
      kind: 'single',
      requestMessageId,
      settled: false,
      timeoutHandle: setTimeout(() => {
        this.settle(requestMessageId, (e) => {
          if (e.kind === 'single') {
            e.rejectFn(new RequestTimeoutError('request timed out'));
          }
        });
      }, options.timeoutMs),
      resolveFn: resolveFn as (reply: Message) => void,
      rejectFn,
      signal: options.signal,
    };

    if (options.signal) {
      const listener = (): void => {
        this.settle(requestMessageId, (e) => {
          if (e.kind === 'single') {
            e.rejectFn(new AbortError('request aborted'));
          }
        });
      };
      entry.abortListener = listener;
      options.signal.addEventListener('abort', listener, { once: true });
    }

    this.pending.set(requestMessageId, entry);
    return { requestMessageId, promise };
  }

  registerMulti<TReply extends Message>(
    options: RegisterMultiOptions,
  ): MultiRequestRegistration<TReply> {
    const requestMessageId = newMessageId();

    let resolveFn!: (replies: TReply[]) => void;
    let rejectFn!: (error: Error) => void;
    const promise = new Promise<TReply[]>((resolve, reject) => {
      resolveFn = resolve;
      rejectFn = reject;
    });

    if (options.signal?.aborted) {
      rejectFn(new AbortError('request aborted'));
      return { requestMessageId, promise };
    }

    const expectedReplyCount =
      typeof options.expectedReplyCount === 'number' && options.expectedReplyCount > 0
        ? options.expectedReplyCount
        : undefined;

    const replies: TReply[] = [];

    const entry: MultiPendingEntry<Message> = {
      kind: 'multi',
      requestMessageId,
      settled: false,
      expectedReplyCount,
      replies: replies as unknown as Message[],
      timeoutHandle: setTimeout(() => {
        this.settle(requestMessageId, (e) => {
          if (e.kind !== 'multi') return;
          if (e.expectedReplyCount !== undefined && e.replies.length < e.expectedReplyCount) {
            e.rejectFn(
              new RequestTimeoutError(
                `expected ${e.expectedReplyCount} replies, received ${e.replies.length}`,
                e.replies,
              ),
            );
          } else {
            e.resolveFn(e.replies);
          }
        });
      }, options.timeoutMs),
      resolveFn: resolveFn as (replies: Message[]) => void,
      rejectFn,
      signal: options.signal,
    };

    if (options.signal) {
      const listener = (): void => {
        this.settle(requestMessageId, (e) => {
          if (e.kind === 'multi') {
            e.rejectFn(new AbortError('request aborted'));
          }
        });
      };
      entry.abortListener = listener;
      options.signal.addEventListener('abort', listener, { once: true });
    }

    this.pending.set(requestMessageId, entry);
    return { requestMessageId, promise };
  }

  registerCallback<TReply extends Message>(
    onReply: (reply: TReply) => void,
    options: RegisterMultiOptions,
  ): CallbackRequestRegistration {
    const requestMessageId = newMessageId();

    let resolveFn!: () => void;
    let rejectFn!: (error: Error) => void;
    const promise = new Promise<void>((resolve, reject) => {
      resolveFn = resolve;
      rejectFn = reject;
    });

    if (options.signal?.aborted) {
      rejectFn(new AbortError('request aborted'));
      return { requestMessageId, promise };
    }

    const expectedReplyCount =
      typeof options.expectedReplyCount === 'number' && options.expectedReplyCount > 0
        ? options.expectedReplyCount
        : undefined;

    const entry: CallbackPendingEntry<Message> = {
      kind: 'callback',
      requestMessageId,
      settled: false,
      expectedReplyCount,
      onReply: onReply as (reply: Message) => void,
      replies: [],
      timeoutHandle: setTimeout(() => {
        this.settle(requestMessageId, (e) => {
          if (e.kind !== 'callback') return;
          if (e.expectedReplyCount !== undefined && e.replies.length < e.expectedReplyCount) {
            e.rejectFn(
              new RequestTimeoutError(
                `expected ${e.expectedReplyCount} replies, received ${e.replies.length}`,
                e.replies,
              ),
            );
          } else {
            e.resolveFn();
          }
        });
      }, options.timeoutMs),
      resolveFn,
      rejectFn,
      signal: options.signal,
    };

    if (options.signal) {
      const listener = (): void => {
        this.settle(requestMessageId, (e) => {
          if (e.kind === 'callback') {
            e.rejectFn(new AbortError('request aborted'));
          }
        });
      };
      entry.abortListener = listener;
      options.signal.addEventListener('abort', listener, { once: true });
    }

    this.pending.set(requestMessageId, entry);
    return { requestMessageId, promise };
  }

  tryRouteReply(envelope: Envelope, deserialized: Message): boolean {
    const headers = envelope.headers as MessageHeaders;
    const responseMessageId = headers.responseMessageId;
    if (!responseMessageId) return false;
    const entry = this.pending.get(responseMessageId);
    if (!entry || entry.settled) return false;

    if (entry.kind === 'single') {
      this.settle(responseMessageId, (e) => {
        if (e.kind === 'single') e.resolveFn(deserialized);
      });
      return true;
    }

    if (entry.kind === 'multi') {
      entry.replies.push(deserialized);
      if (
        entry.expectedReplyCount !== undefined &&
        entry.replies.length >= entry.expectedReplyCount
      ) {
        this.settle(responseMessageId, (e) => {
          if (e.kind === 'multi') e.resolveFn(e.replies);
        });
      }
      return true;
    }

    // callback
    try {
      entry.onReply(deserialized);
      entry.replies.push(deserialized);
      if (
        entry.expectedReplyCount !== undefined &&
        entry.replies.length >= entry.expectedReplyCount
      ) {
        this.settle(responseMessageId, (e) => {
          if (e.kind === 'callback') e.resolveFn();
        });
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.settle(responseMessageId, (e) => {
        if (e.kind === 'callback') e.rejectFn(error);
      });
    }
    return true;
  }

  cancel(requestMessageId: MessageId, error: Error): void {
    this.settle(requestMessageId, (e) => {
      e.rejectFn(error);
    });
  }

  shutdown(reason: Error): void {
    for (const id of [...this.pending.keys()]) {
      this.settle(id, (e) => {
        e.rejectFn(reason);
      });
    }
  }

  /** Internal: settles the entry by calling the supplied finaliser, then removes from map. */
  private settle(requestMessageId: MessageId, finalise: (entry: PendingEntry) => void): void {
    const entry = this.pending.get(requestMessageId);
    if (!entry || entry.settled) return;
    entry.settled = true;
    clearTimeout(entry.timeoutHandle);
    if (entry.abortListener && entry.signal) {
      entry.signal.removeEventListener('abort', entry.abortListener);
    }
    this.pending.delete(requestMessageId);
    finalise(entry);
  }
}
