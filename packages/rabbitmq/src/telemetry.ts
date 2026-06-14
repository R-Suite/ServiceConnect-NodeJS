import type { Attributes } from '@opentelemetry/api';
import {
    ATTR_ERROR_TYPE,
    ATTR_MESSAGING_DESTINATION_NAME,
    ATTR_MESSAGING_OPERATION_NAME,
    ATTR_MESSAGING_OPERATION_TYPE,
    ATTR_MESSAGING_OUTCOME,
    OPERATION_NAME_PROCESS,
    OPERATION_NAME_PUBLISH,
    OPERATION_TYPE_PROCESS,
    OPERATION_TYPE_PUBLISH,
    serviceConnectMeter,
} from '@serviceconnect/core';

/**
 * Records publish-side metrics. Producer operations (publish, send, sendBytes) are tagged
 * uniformly with operation publish/publish; only the destination differs. published.messages
 * is incremented on success only; the duration histogram always records and carries error.type
 * on failure. Mirrors the C# producer's EmitPublishMetrics.
 *
 * `base` is the constant messaging.system / protocol / server.* attribute set, built once per
 * producer via {@link @serviceconnect/core#messagingSystemAttributes}.
 */
export function emitPublishMetrics(
    base: Attributes,
    destination: string,
    durationSeconds: number,
    errorType?: string,
): void {
    const tags: Attributes = {
        ...base,
        [ATTR_MESSAGING_OPERATION_TYPE]: OPERATION_TYPE_PUBLISH,
        [ATTR_MESSAGING_OPERATION_NAME]: OPERATION_NAME_PUBLISH,
        [ATTR_MESSAGING_DESTINATION_NAME]: destination,
    };
    serviceConnectMeter.recordPublishDuration(
        durationSeconds,
        errorType ? { ...tags, [ATTR_ERROR_TYPE]: errorType } : tags,
    );
    if (!errorType) {
        serviceConnectMeter.addPublishedMessage(tags);
    }
}

/**
 * Records consume-side metrics. consumed.messages is always incremented, tagged by outcome
 * (success | retry | error); the duration histogram always records. Both carry error.type when
 * the outcome is an error. Mirrors the C# consumer's EmitProcessMetrics.
 *
 * `base` is the constant messaging.system / protocol / server.* attribute set, built once per
 * consumer via {@link @serviceconnect/core#messagingSystemAttributes}.
 */
export function emitConsumeMetrics(
    base: Attributes,
    destination: string,
    durationSeconds: number,
    outcome: string,
    errorType?: string,
): void {
    const tags: Attributes = {
        ...base,
        [ATTR_MESSAGING_OPERATION_TYPE]: OPERATION_TYPE_PROCESS,
        [ATTR_MESSAGING_OPERATION_NAME]: OPERATION_NAME_PROCESS,
        [ATTR_MESSAGING_DESTINATION_NAME]: destination,
    };
    serviceConnectMeter.recordProcessDuration(
        durationSeconds,
        errorType ? { ...tags, [ATTR_ERROR_TYPE]: errorType } : tags,
    );
    const consumedTags: Attributes = { ...tags, [ATTR_MESSAGING_OUTCOME]: outcome };
    if (errorType) {
        consumedTags[ATTR_ERROR_TYPE] = errorType;
    }
    serviceConnectMeter.addConsumedMessage(consumedTags);
}
