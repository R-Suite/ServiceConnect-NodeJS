import { describe, expect, it } from 'vitest';
import { decodeWireHeaders, encodeWireHeaders } from '../../src/wire/headers.js';

describe('encodeWireHeaders (outbound: internal camelCase -> master wire)', () => {
    it('maps the type to TypeName and stamps the operation as MessageType', () => {
        const out = encodeWireHeaders(
            { messageType: 'MyApp.Messages.OrderPlaced', messageId: 'm', sourceAddress: 'q' },
            'Publish',
        );
        expect(out.TypeName).toBe('MyApp.Messages.OrderPlaced');
        expect(out.MessageType).toBe('Publish');
        expect(out.MessageId).toBe('m');
        expect(out.SourceAddress).toBe('q');
        expect(out.ConsumerType).toBe('RabbitMQ');
        expect(out.Language).toBe('Node');
        expect(out.FullTypeName).toBeUndefined();
    });

    it('does NOT emit a CorrelationId header (it lives in the body)', () => {
        const out = encodeWireHeaders({ messageType: 'T', correlationId: 'c' }, 'Send');
        expect(out.CorrelationId).toBeUndefined();
    });

    it('maps request/reply + retry headers and stringifies values', () => {
        const out = encodeWireHeaders(
            { messageType: 'T', requestMessageId: 'r', responseMessageId: 's', retryCount: 2 },
            'Send',
        );
        expect(out.RequestMessageId).toBe('r');
        expect(out.ResponseMessageId).toBe('s');
        expect(out.RetryCount).toBe('2');
    });

    it('passes through unknown custom headers unchanged', () => {
        const out = encodeWireHeaders({ messageType: 'T', 'X-Custom': 'v' }, 'Send');
        expect(out['X-Custom']).toBe('v');
    });
});

describe('decodeWireHeaders (inbound: master wire -> internal camelCase)', () => {
    it('resolves messageType from TypeName', () => {
        const h = decodeWireHeaders({ TypeName: 'MyApp.Messages.OrderPlaced', MessageId: 'm' });
        expect(h.messageType).toBe('MyApp.Messages.OrderPlaced');
        expect(h.messageId).toBe('m');
    });

    it('prefers FullTypeName and comma-splits it to the FullName', () => {
        const h = decodeWireHeaders({
            TypeName: 'MyApp.Messages.OrderPlaced',
            FullTypeName: 'MyApp.Messages.OrderPlaced, MyApp, Version=1.0.0.0, Culture=neutral',
        });
        expect(h.messageType).toBe('MyApp.Messages.OrderPlaced');
    });

    it('maps SourceAddress/RequestMessageId/ResponseMessageId to camelCase', () => {
        const h = decodeWireHeaders({
            TypeName: 'T',
            SourceAddress: 'requester',
            RequestMessageId: 'r',
            ResponseMessageId: 's',
        });
        expect(h.sourceAddress).toBe('requester');
        expect(h.requestMessageId).toBe('r');
        expect(h.responseMessageId).toBe('s');
    });

    it('passes through unknown headers unchanged', () => {
        const h = decodeWireHeaders({ TypeName: 'T', 'X-Custom': 'v' });
        expect((h as Record<string, unknown>)['X-Custom']).toBe('v');
    });
});
