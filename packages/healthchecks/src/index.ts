export const PACKAGE_NAME = '@serviceconnect/healthchecks' as const;

export type { HealthCheck, HealthCheckResult, HealthCheckStatus } from './result.js';
export { producerConnectivity } from './producer.js';
export { consumerBusy, consumerConnectivity } from './consumer.js';
