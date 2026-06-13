import type { Logger } from '../lib/log.js';
import type { BrokerChaos, ChaosEvent } from './index.js';

export interface SoftChaosOptions {
    readonly intervalMs: number;
    readonly downtimeMs: number;
    readonly logger: Logger;
}

/**
 * Phase H placeholder chaos: records the cadence of chaos events that WOULD happen
 * but does not actually stop the broker. A future iteration will replace this with
 * a docker-compose-driven implementation that can stop+start the same broker port.
 */
export function testcontainersChaos(options: SoftChaosOptions): BrokerChaos {
    const events: ChaosEvent[] = [];
    let timer: NodeJS.Timeout | undefined;
    let stopped = false;

    return {
        async start() {
            timer = setInterval(() => {
                if (stopped) return;
                const stoppedAt = new Date();
                const startedAt = new Date(stoppedAt.getTime() + options.downtimeMs);
                events.push({ stoppedAt, startedAt, downtimeMs: options.downtimeMs });
                options.logger.warn(
                    'chaos: soft event recorded (broker not actually toggled in Phase H)',
                );
            }, options.intervalMs);
        },
        async stop() {
            stopped = true;
            if (timer) clearInterval(timer);
        },
        events(): readonly ChaosEvent[] {
            return events;
        },
    };
}
