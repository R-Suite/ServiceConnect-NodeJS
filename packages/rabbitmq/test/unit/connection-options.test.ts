import type EventEmitter from 'node:events';
import { describe, expect, it } from 'vitest';
import { buildConnectionOptions, createRabbitMQConnection } from '../../src/connection.js';

// Regression for connection.ts: (1) every connection has an 'error' listener so a transient broker
// disconnect cannot become an uncaught exception that crashes the process; (2) TLS config is
// forwarded so mutual-TLS / private-CA brokers can be configured.

describe('connection options', () => {
    it('forwards tls config to rabbitmq-client when provided', () => {
        const tls = { ca: 'ca-pem', cert: 'cert-pem', key: 'key-pem' };
        const opts = buildConnectionOptions({ url: 'amqps://broker', tls }, 'producer');
        expect(opts.tls).toEqual(tls);
    });

    it('forwards tls:true', () => {
        expect(buildConnectionOptions({ url: 'amqps://broker', tls: true }, 'consumer').tls).toBe(
            true,
        );
    });

    it('omits tls when not configured (unchanged behaviour)', () => {
        expect('tls' in buildConnectionOptions({ url: 'amqp://broker' }, 'producer')).toBe(false);
    });

    it('attaches an error listener so a connection error never goes unhandled', async () => {
        const conn = createRabbitMQConnection(
            { url: 'amqp://guest:guest@localhost:5672' },
            'producer',
        );
        expect((conn as unknown as EventEmitter).listenerCount('error')).toBeGreaterThanOrEqual(1);
        await conn.close();
    });

    it('routes connection errors to the onConnectionError callback', async () => {
        const seen: Array<{ role: string; message: string }> = [];
        const conn = createRabbitMQConnection(
            {
                url: 'amqp://guest:guest@localhost:5672',
                onConnectionError: (err, role) => seen.push({ role, message: err.message }),
            },
            'consumer',
        );
        // Emitting 'error' must be delivered to the callback and must NOT throw (no unhandled error).
        (conn as unknown as EventEmitter).emit('error', new Error('simulated disconnect'));
        expect(seen).toEqual([{ role: 'consumer', message: 'simulated disconnect' }]);
        await conn.close();
    });
});
