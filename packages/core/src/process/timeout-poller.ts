import type { Logger } from '../logger.js';
import type { ITimeoutStore } from '../persistence/timeout-store.js';

export interface TimeoutPollerOptions {
  store: ITimeoutStore;
  intervalMs: number;
  logger: Logger;
  publish: (messageType: string, body: object) => Promise<void>;
}

export class TimeoutPoller {
  private timer?: NodeJS.Timeout;
  private inflight?: Promise<void>;
  private stopped = false;

  constructor(private readonly opts: TimeoutPollerOptions) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.inflight = this.tick().catch((err) => {
        this.opts.logger.warn('timeout poller tick failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, this.opts.intervalMs);
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    if (this.inflight) {
      await this.inflight;
    }
  }

  private async tick(): Promise<void> {
    const due = await this.opts.store.claimDue(new Date(), 100);
    for (const record of due) {
      const body = {
        correlationId: record.sagaCorrelationId,
        ...(record.payload ?? {}),
      };
      try {
        await this.opts.publish(record.name, body);
      } catch (err) {
        this.opts.logger.warn('timeout publish failed; leaving record for next tick', {
          id: record.id,
          error: err instanceof Error ? err.message : String(err),
        });
        continue;
      }
      try {
        await this.opts.store.delete(record.id);
      } catch (err) {
        this.opts.logger.warn('timeout store delete failed after successful publish', {
          id: record.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
}
