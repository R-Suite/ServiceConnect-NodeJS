export type HealthCheckStatus = 'healthy' | 'unhealthy' | 'degraded';

export interface HealthCheckResult {
  readonly status: HealthCheckStatus;
  readonly description?: string;
  readonly data?: Readonly<Record<string, unknown>>;
}

export type HealthCheck = () => Promise<HealthCheckResult>;
