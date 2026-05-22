import type { Logger } from '../logger.js';
import type { AggregatorRegistry } from './registry.js';

export interface AggregatorFlushTimerOptions {
  registry: AggregatorRegistry;
  intervalMs: number;
  leaseMs: number;
  logger: Logger;
}

export class AggregatorFlushTimer {
  private timer?: NodeJS.Timeout;
  private inflight?: Promise<void>;
  private stopped = false;

  constructor(private readonly opts: AggregatorFlushTimerOptions) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.inflight = this.tick().catch((err) => {
        this.opts.logger.warn('aggregator flush tick failed', {
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
    if (this.inflight) await this.inflight;
  }

  private async tick(): Promise<void> {
    const timeouts = this.opts.registry.timeouts();
    const signal = new AbortController().signal;
    for (const store of this.opts.registry.stores()) {
      const claims = await store.expireDueLeases(timeouts, this.opts.leaseMs);
      for (const claim of claims) {
        const entry = this.opts.registry.entryFor(claim.aggregatorType);
        if (!entry) continue;
        try {
          await entry.aggregator.execute(claim.messages, signal);
          await store.releaseSnapshot(claim.snapshotId);
        } catch (err) {
          this.opts.logger.warn('aggregator execute via flush threw; leaving lease', {
            aggregatorType: claim.aggregatorType,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  }
}
