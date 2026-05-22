import type { AsyncMessage, Publisher } from 'rabbitmq-client';

export function buildAuditHeaders(
  original: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return {
    ...original,
    TimeProcessed: new Date().toISOString(),
    Success: 'true',
  };
}

export async function publishAudit(
  publisher: Publisher,
  auditQueue: string,
  msg: AsyncMessage,
): Promise<void> {
  const headers = buildAuditHeaders(msg.headers ?? {});
  await publisher.send({ exchange: '', routingKey: auditQueue, headers }, msg.body);
}
