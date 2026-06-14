// OpenTelemetry semantic conventions shared by ServiceConnect metrics (emitted by the
// transport) and traces (emitted by @serviceconnect/telemetry). Mirrors the C# stack's
// MessagingAttributes / MetricNames so a mixed C#/Node deployment shares one schema.

// Instrumentation scope used by the tracer and meter. Matches the C# ActivitySource/Meter
// name ("ServiceConnect.Bus").
export const INSTRUMENTATION_SCOPE = 'ServiceConnect.Bus';

// OpenTelemetry messaging semantic-convention attribute keys.
export const ATTR_MESSAGING_SYSTEM = 'messaging.system';
export const ATTR_MESSAGING_OPERATION_TYPE = 'messaging.operation.type';
export const ATTR_MESSAGING_OPERATION_NAME = 'messaging.operation.name';
export const ATTR_MESSAGING_DESTINATION_NAME = 'messaging.destination.name';
export const ATTR_MESSAGING_DESTINATION_ANONYMOUS = 'messaging.destination.anonymous';
export const ATTR_MESSAGING_DESTINATION_ROUTING_KEY = 'messaging.rabbitmq.destination.routing_key';
export const ATTR_MESSAGING_MESSAGE_ID = 'messaging.message.id';
export const ATTR_MESSAGING_MESSAGE_CONVERSATION_ID = 'messaging.message.conversation_id';
export const ATTR_MESSAGING_MESSAGE_BODY_SIZE = 'messaging.message.body.size';
export const ATTR_PROTOCOL_NAME = 'network.protocol.name';
export const ATTR_SERVER_ADDRESS = 'server.address';
export const ATTR_SERVER_PORT = 'server.port';
export const ATTR_ERROR_TYPE = 'error.type';

// Consume-side counter dimension recording the processing outcome.
export const ATTR_MESSAGING_OUTCOME = 'messaging.outcome';

export const DEFAULT_MESSAGING_SYSTEM = 'rabbitmq';
export const DEFAULT_PROTOCOL_NAME = 'amqp';

// OTel-defined messaging.operation.type values.
export const OPERATION_TYPE_PUBLISH = 'publish';
export const OPERATION_TYPE_PROCESS = 'process';

// Implementation-specific messaging.operation.name values.
export const OPERATION_NAME_PUBLISH = 'publish';
export const OPERATION_NAME_SEND = 'send';
export const OPERATION_NAME_PROCESS = 'process';

// messaging.outcome values for the consumed-messages counter.
export const OUTCOME_SUCCESS = 'success';
export const OUTCOME_ERROR = 'error';
export const OUTCOME_RETRY = 'retry';

// Metric instrument names, units, and descriptions. Identical to the C# stack's
// MetricNames / ServiceConnectMeter so a mixed deployment aggregates onto one series.
export const METRIC_PUBLISH_DURATION = 'messaging.publish.duration';
export const METRIC_PROCESS_DURATION = 'messaging.process.duration';
export const METRIC_PUBLISHED_MESSAGES = 'messaging.client.published.messages';
export const METRIC_CONSUMED_MESSAGES = 'messaging.client.consumed.messages';
