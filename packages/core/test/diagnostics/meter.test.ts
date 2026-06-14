import { metrics } from '@opentelemetry/api';
import {
    AggregationTemporality,
    InMemoryMetricExporter,
    MeterProvider,
    PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { messagingSystemAttributes } from '../../src/diagnostics/attributes.js';
import { serviceConnectMeter } from '../../src/diagnostics/meter.js';
import * as core from '../../src/index.js';

const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
const reader = new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 5_000 });
const provider = new MeterProvider({ readers: [reader] });

beforeAll(() => {
    metrics.setGlobalMeterProvider(provider);
});

afterAll(async () => {
    await provider.shutdown();
});

async function collect(): Promise<
    Map<string, { value: number; attrs: Record<string, unknown> }[]>
> {
    await reader.forceFlush();
    const map = new Map<string, { value: number; attrs: Record<string, unknown> }[]>();
    for (const rm of exporter.getMetrics()) {
        for (const sm of rm.scopeMetrics) {
            for (const m of sm.metrics) {
                map.set(
                    m.descriptor.name,
                    m.dataPoints.map((dp) => ({
                        value:
                            typeof dp.value === 'object'
                                ? (dp.value as { count: number }).count
                                : (dp.value as number),
                        attrs: { ...dp.attributes },
                    })),
                );
            }
        }
    }
    return map;
}

describe('messagingSystemAttributes', () => {
    it('defaults system/protocol and omits unset server fields', () => {
        expect(messagingSystemAttributes()).toEqual({
            'messaging.system': 'rabbitmq',
            'network.protocol.name': 'amqp',
        });
    });

    it('includes server.address/port when set and omits a non-positive port', () => {
        expect(messagingSystemAttributes({ serverAddress: 'h', serverPort: 5672 })).toMatchObject({
            'server.address': 'h',
            'server.port': 5672,
        });
        expect(messagingSystemAttributes({ serverAddress: 'h', serverPort: 0 })).not.toHaveProperty(
            'server.port',
        );
    });
});

describe('serviceConnectMeter (always-on)', () => {
    it('binds to a registered MeterProvider and records all four instruments', async () => {
        const tags = { 'messaging.system': 'rabbitmq' };
        serviceConnectMeter.recordPublishDuration(0.01, tags);
        serviceConnectMeter.addPublishedMessage(tags);
        serviceConnectMeter.recordProcessDuration(0.02, tags);
        serviceConnectMeter.addConsumedMessage({ ...tags, 'messaging.outcome': 'success' });

        const got = await collect();
        expect(got.get('messaging.publish.duration')?.length).toBeGreaterThanOrEqual(1);
        expect(got.get('messaging.client.published.messages')?.[0]?.value).toBeGreaterThanOrEqual(
            1,
        );
        expect(got.get('messaging.process.duration')?.length).toBeGreaterThanOrEqual(1);
        expect(got.get('messaging.client.consumed.messages')?.[0]?.attrs['messaging.outcome']).toBe(
            'success',
        );
    });

    it('re-exports the meter and conventions from the package root', () => {
        expect(core.serviceConnectMeter).toBe(serviceConnectMeter);
        expect(core.METRIC_PUBLISH_DURATION).toBe('messaging.publish.duration');
    });
});
