import { type Meter, metrics } from '@opentelemetry/api';
import {
    INSTRUMENTATION_SCOPE,
    METRIC_CONSUMED_MESSAGES,
    METRIC_PROCESS_DURATION,
    METRIC_PUBLISHED_MESSAGES,
    METRIC_PUBLISH_DURATION,
} from './attributes.js';

export interface TelemetryInstruments {
    publishDuration: ReturnType<Meter['createHistogram']>;
    processDuration: ReturnType<Meter['createHistogram']>;
    publishedMessages: ReturnType<Meter['createCounter']>;
    consumedMessages: ReturnType<Meter['createCounter']>;
}

export function buildInstruments(meter?: Meter): TelemetryInstruments {
    const m = meter ?? metrics.getMeter(INSTRUMENTATION_SCOPE);
    return {
        publishDuration: m.createHistogram(METRIC_PUBLISH_DURATION, {
            description: 'Duration of a publish operation, from start to broker ack.',
            unit: 's',
        }),
        processDuration: m.createHistogram(METRIC_PROCESS_DURATION, {
            description: 'Duration of consumer-side message processing (handler dispatch).',
            unit: 's',
        }),
        publishedMessages: m.createCounter(METRIC_PUBLISHED_MESSAGES, {
            description: 'Number of messages successfully published.',
            unit: '{message}',
        }),
        consumedMessages: m.createCounter(METRIC_CONSUMED_MESSAGES, {
            description: 'Number of messages consumed, tagged by outcome.',
            unit: '{message}',
        }),
    };
}
