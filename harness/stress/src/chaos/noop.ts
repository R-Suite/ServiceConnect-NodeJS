import type { BrokerChaos, ChaosEvent } from './index.js';

export function noopChaos(): BrokerChaos {
  return {
    async start() {},
    async stop() {},
    events(): readonly ChaosEvent[] {
      return [];
    },
  };
}
