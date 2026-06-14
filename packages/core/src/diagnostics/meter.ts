import {
    type Attributes,
    type Counter,
    type Histogram,
    type Meter,
    metrics,
} from '@opentelemetry/api';
import {
    INSTRUMENTATION_SCOPE,
    METRIC_CONSUMED_MESSAGES,
    METRIC_PROCESS_DURATION,
    METRIC_PUBLISHED_MESSAGES,
    METRIC_PUBLISH_DURATION,
} from './conventions.js';

interface Instruments {
    publishDuration: Histogram;
    processDuration: Histogram;
    publishedMessages: Counter;
    consumedMessages: Counter;
}

let cachedMeter: Meter | undefined;
let cached: Instruments | undefined;

// Instruments are created lazily and rebound if the global meter changes. Until an app
// registers a MeterProvider, `metrics.getMeter` returns a no-op meter whose instruments are
// inert (zero cost) — the same always-on contract as the C# stack's System.Diagnostics.Metrics
// meter. Rebinding on identity change upgrades from the no-op meter to the real one when a
// provider is registered after the first emission.
function instruments(): Instruments {
    const meter = metrics.getMeter(INSTRUMENTATION_SCOPE);
    if (!cached || meter !== cachedMeter) {
        cachedMeter = meter;
        cached = {
            publishDuration: meter.createHistogram(METRIC_PUBLISH_DURATION, {
                description: 'Duration of a publish operation, from start to broker ack.',
                unit: 's',
            }),
            processDuration: meter.createHistogram(METRIC_PROCESS_DURATION, {
                description: 'Duration of consumer-side message processing (handler dispatch).',
                unit: 's',
            }),
            publishedMessages: meter.createCounter(METRIC_PUBLISHED_MESSAGES, {
                description: 'Number of messages successfully published.',
                unit: '{message}',
            }),
            consumedMessages: meter.createCounter(METRIC_CONSUMED_MESSAGES, {
                description: 'Number of messages consumed, tagged by outcome.',
                unit: '{message}',
            }),
        };
    }
    return cached;
}

/**
 * Always-on meter for ServiceConnect's messaging metrics. Mirrors the C# `ServiceConnectMeter`:
 * the instruments live here in core; the transport builds the per-operation attribute sets and
 * records through these helpers. Callers pass durations in seconds.
 */
export const serviceConnectMeter = {
    recordPublishDuration(seconds: number, attributes: Attributes): void {
        instruments().publishDuration.record(seconds, attributes);
    },
    addPublishedMessage(attributes: Attributes): void {
        instruments().publishedMessages.add(1, attributes);
    },
    recordProcessDuration(seconds: number, attributes: Attributes): void {
        instruments().processDuration.record(seconds, attributes);
    },
    addConsumedMessage(attributes: Attributes): void {
        instruments().consumedMessages.add(1, attributes);
    },
};
