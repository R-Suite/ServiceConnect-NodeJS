import type { Bus } from '@serviceconnect/core';
import type { HealthCheck } from './result.js';

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
