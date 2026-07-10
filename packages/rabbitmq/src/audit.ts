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
    // durable:true so audited messages survive a broker restart in the durable audit queue.
    await publisher.send(
        {
            exchange: auditQueue,
            routingKey: '',
            durable: true,
            contentType: msg.contentType,
            contentEncoding: msg.contentEncoding,
            headers,
        },
        msg.body,
    );
}
