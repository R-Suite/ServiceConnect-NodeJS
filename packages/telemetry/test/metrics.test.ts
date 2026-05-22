import { metrics } from '@opentelemetry/api';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import type { ConsumeResult, ITransportProducer } from '@serviceconnect/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { telemetryConsumeWrapper } from '../src/consume-wrap.js';
import { telemetryProducer } from '../src/producer-wrap.js';

const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
const reader = new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 5_000 });
const provider = new MeterProvider({ readers: [reader] });

beforeAll(() => {
  metrics.setGlobalMeterProvider(provider);
});

afterAll(async () => {
  await provider.shutdown();
});

function fakeProducer(): ITransportProducer {
  return {
    get isHealthy() {
      return true;
    },
    supportsRoutingKey: false,
    maxMessageSize: Number.POSITIVE_INFINITY,
    async publish() {},
    async send() {},
    async sendBytes() {},
    async [Symbol.asyncDispose]() {},
  };
}

async function collectMetrics(): Promise<
  Map<string, { value: number; attrs: Record<string, unknown> }[]>
> {
  await reader.forceFlush();
  const result = exporter.getMetrics();
  const map = new Map<string, { value: number; attrs: Record<string, unknown> }[]>();
  for (const resourceMetric of result) {
    for (const scopeMetric of resourceMetric.scopeMetrics) {
      for (const metric of scopeMetric.metrics) {
        const entries = metric.dataPoints.map((dp) => ({
          value:
            typeof dp.value === 'object'
              ? (dp.value as { count: number }).count
              : (dp.value as number),
          attrs: { ...dp.attributes },
        }));
        const existing = map.get(metric.descriptor.name) ?? [];
        map.set(metric.descriptor.name, existing.concat(entries));
      }
    }
  }
  return map;
}

const ok: ConsumeResult = { success: true, notHandled: false, terminalFailure: false };
const fail: ConsumeResult = {
  success: false,
  notHandled: false,
  error: new Error('boom'),
  terminalFailure: false,
};

describe('telemetry metrics', () => {
  it('records publish.count + consume.count + duration histogram', async () => {
    const producer = telemetryProducer(fakeProducer());
    await producer.publish('OrderCreated', new Uint8Array(4), {
      headers: { correlationId: 'c' },
    });

    const consume = telemetryConsumeWrapper();
    await consume(async () => ok)(
      {
        headers: { messageType: 'OrderCreated', correlationId: 'c' },
        body: new Uint8Array(4),
      },
      new AbortController().signal,
    );

    const got = await collectMetrics();
    expect(got.get('serviceconnect.publish.count')?.length).toBeGreaterThanOrEqual(1);
    expect(got.get('serviceconnect.consume.count')?.length).toBeGreaterThanOrEqual(1);
    expect(got.get('serviceconnect.processing.duration')?.length).toBeGreaterThanOrEqual(1);
  });

  it('records error.count on producer + consume failure', async () => {
    const badProducer = telemetryProducer({
      get isHealthy() {
        return true;
      },
      supportsRoutingKey: false,
      maxMessageSize: Number.POSITIVE_INFINITY,
      async publish() {
        throw new Error('broker-down');
      },
      async send() {},
      async sendBytes() {},
      async [Symbol.asyncDispose]() {},
    });

    await expect(badProducer.publish('OrderCreated', new Uint8Array(0))).rejects.toThrow(
      'broker-down',
    );

    await telemetryConsumeWrapper()(async () => fail)(
      {
        headers: { messageType: 'OrderCreated', correlationId: 'c' },
        body: new Uint8Array(0),
      },
      new AbortController().signal,
    );

    const got = await collectMetrics();
    const errors = got.get('serviceconnect.error.count') ?? [];
    expect(errors.length).toBeGreaterThanOrEqual(1);
  });
});
