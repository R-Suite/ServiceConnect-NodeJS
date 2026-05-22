export const PACKAGE_NAME = '@serviceconnect/telemetry' as const;
export { telemetryProducer, type TelemetryOptions } from './producer-wrap.js';
export { telemetryConsumeWrapper } from './consume-wrap.js';
