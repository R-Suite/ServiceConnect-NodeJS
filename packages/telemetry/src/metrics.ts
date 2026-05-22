import { type Meter, metrics } from '@opentelemetry/api';

const DURATION_BOUNDARIES_MS = [
  5, 10, 25, 50, 75, 100, 250, 500, 750, 1000, 2500, 5000, 7500, 10000,
];

export interface TelemetryInstruments {
  publishCount: ReturnType<Meter['createCounter']>;
  consumeCount: ReturnType<Meter['createCounter']>;
  errorCount: ReturnType<Meter['createCounter']>;
  duration: ReturnType<Meter['createHistogram']>;
}

export function buildInstruments(meter?: Meter): TelemetryInstruments {
  const m = meter ?? metrics.getMeter('@serviceconnect/telemetry');
  return {
    publishCount: m.createCounter('serviceconnect.publish.count', {
      description: 'Number of messages published or sent by the bus.',
      unit: '{message}',
    }),
    consumeCount: m.createCounter('serviceconnect.consume.count', {
      description: 'Number of messages consumed by the bus.',
      unit: '{message}',
    }),
    errorCount: m.createCounter('serviceconnect.error.count', {
      description: 'Number of messaging operations that failed.',
      unit: '{error}',
    }),
    duration: m.createHistogram('serviceconnect.processing.duration', {
      description: 'Processing duration of a consumed message.',
      unit: 'ms',
      advice: { explicitBucketBoundaries: DURATION_BOUNDARIES_MS },
    }),
  };
}
