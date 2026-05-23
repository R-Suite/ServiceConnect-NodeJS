export interface ChaosEvent {
  readonly stoppedAt: Date;
  readonly startedAt: Date;
  readonly downtimeMs: number;
}

export interface BrokerChaos {
  start(): Promise<void>;
  stop(): Promise<void>;
  events(): readonly ChaosEvent[];
}
