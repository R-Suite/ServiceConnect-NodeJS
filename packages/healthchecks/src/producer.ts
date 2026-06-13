import type { Bus } from '@serviceconnect/core';
import type { HealthCheck } from './result.js';

export function producerConnectivity(bus: Bus): HealthCheck {
    return async () => {
        if (bus.producer.isHealthy) {
            return { status: 'healthy' as const };
        }
        return {
            status: 'unhealthy' as const,
            description: 'producer is not connected',
        };
    };
}
