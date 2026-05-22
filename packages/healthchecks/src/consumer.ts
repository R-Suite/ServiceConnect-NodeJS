import type { Bus } from '@serviceconnect/core';
import type { HealthCheck } from './result.js';

const DEFAULT_GRACE_MS = 5000;

export function consumerBusy(bus: Bus, options?: { graceMs?: number }): HealthCheck {
  const graceMs = options?.graceMs ?? DEFAULT_GRACE_MS;
  return async () => {
    if (!bus.consumer.isConnected) {
      return {
        status: 'unhealthy' as const,
        description: 'consumer is not connected',
      };
    }
    const last = bus.lastConsumedAt;
    if (last === undefined) {
      return {
        status: 'healthy' as const,
        description: 'no messages consumed yet',
      };
    }
    const age = Date.now() - last.getTime();
    if (age <= graceMs) {
      return {
        status: 'healthy' as const,
        data: { lastConsumedAt: last.toISOString(), ageMs: age },
      };
    }
    return {
      status: 'degraded' as const,
      description: `no messages consumed in last ${graceMs} ms`,
      data: { lastConsumedAt: last.toISOString(), ageMs: age },
    };
  };
}

export function consumerConnectivity(bus: Bus): HealthCheck {
  return async () => {
    if (bus.consumer.isCancelledByBroker) {
      return {
        status: 'unhealthy' as const,
        description: 'consumer was cancelled by the broker',
      };
    }
    if (!bus.consumer.isConnected) {
      return {
        status: 'unhealthy' as const,
        description: 'consumer is not connected',
      };
    }
    return { status: 'healthy' as const };
  };
}
