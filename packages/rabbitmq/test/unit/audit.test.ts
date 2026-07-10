import type { AsyncMessage, Publisher } from 'rabbitmq-client';
import { describe, expect, it, vi } from 'vitest';
import { buildAuditHeaders, publishAudit } from '../../src/audit.js';

describe('buildAuditHeaders', () => {
    it('adds TimeProcessed and Success headers', () => {
        const headers = buildAuditHeaders({ MessageType: 'OrderCreated' });
        expect(headers.MessageType).toBe('OrderCreated');
        expect(typeof headers.TimeProcessed).toBe('string');
        expect((headers.TimeProcessed as string).endsWith('Z')).toBe(true);
        expect(headers.Success).toBe('true');
    });

    it('preserves caller headers', () => {
        const headers = buildAuditHeaders({ Custom: 'value' });
        expect(headers.Custom).toBe('value');
    });
});

describe('publishAudit', () => {
    it('calls publisher.send to the audit queue with the original body', async () => {
        const publisher = { send: vi.fn(async () => {}) } as unknown as Publisher;
        const msg = {
            body: Buffer.from([1, 2, 3]),
            headers: { MessageType: 'OrderCreated' },
        } as unknown as AsyncMessage;
        await publishAudit(publisher, 'audit', msg);
        expect(publisher.send).toHaveBeenCalledOnce();
        const call = (publisher.send as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(call?.[0]).toMatchObject({ exchange: 'audit', routingKey: '' });
        expect(call?.[1]).toEqual(Buffer.from([1, 2, 3]));
    });
});
