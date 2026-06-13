import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createRabbitMQTransport } from '../../src/transport.js';

// Regression: a transient broker disconnect must NOT crash the process. The connection has an
// 'error' listener, so the error is routed to onConnectionError instead of becoming an uncaught
// exception. (Before the fix, force-closing the connection emitted an unhandled 'error'.)

const auth = `Basic ${Buffer.from('guest:guest').toString('base64')}`;

interface MgmtConn {
    name: string;
    client_properties?: { connection_name?: string };
}

async function listConnections(): Promise<MgmtConn[]> {
    const res = await fetch('http://localhost:15672/api/connections', {
        headers: { Authorization: auth },
    });
    return res.ok ? ((await res.json()) as MgmtConn[]) : [];
}

async function closeConnectionByName(namePrefix: string): Promise<boolean> {
    const conns = await listConnections();
    const match = conns.find((c) => c.client_properties?.connection_name?.startsWith(namePrefix));
    if (!match) return false;
    const res = await fetch(
        `http://localhost:15672/api/connections/${encodeURIComponent(match.name)}`,
        {
            method: 'DELETE',
            headers: { Authorization: auth },
        },
    );
    return res.status === 204 || res.status === 200;
}

async function waitFor(cond: () => boolean, ms = 8000): Promise<void> {
    const start = Date.now();
    while (!cond() && Date.now() - start < ms) await new Promise((r) => setTimeout(r, 100));
}

describe('connection resilience', () => {
    it('routes a forced disconnect to onConnectionError instead of crashing', async () => {
        const url = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
        const connName = `sc-resil-${randomUUID().slice(0, 8)}`;
        const errors: Array<{ role: string; message: string }> = [];

        const { producer, consumer } = createRabbitMQTransport({
            url,
            connectionName: connName,
            onConnectionError: (err, role) => errors.push({ role, message: err.message }),
        });

        // Open both connections.
        await consumer.start(`q-resil-${randomUUID().slice(0, 8)}`, [], async () => ({
            success: true,
            notHandled: false,
            terminalFailure: false,
        }));
        await producer.publish('Warmup', new TextEncoder().encode('{}')).catch(() => undefined);

        // Force the broker to close our connection unexpectedly (retry until the named connection is
        // visible in the management API).
        let closed = false;
        const deadline = Date.now() + 8000;
        while (!closed && Date.now() < deadline) {
            closed = await closeConnectionByName(connName);
            if (!closed) await new Promise((r) => setTimeout(r, 150));
        }
        expect(closed).toBe(true);

        // The error is delivered to the callback and the process does not crash (if it had, vitest
        // would report an unhandled error and fail this file).
        await waitFor(() => errors.length > 0);
        expect(errors.length).toBeGreaterThanOrEqual(1);

        await consumer.stop().catch(() => undefined);
        await producer[Symbol.asyncDispose]().catch(() => undefined);
    }, 30_000);
});
