import { describe, expect, it } from 'vitest';
import { normalizeHeaderValue, toEnvelope } from '../../src/envelope.js';

describe('normalizeHeaderValue', () => {
    it('passes through strings, numbers, booleans', () => {
        expect(normalizeHeaderValue('abc')).toBe('abc');
        expect(normalizeHeaderValue(42)).toBe(42);
        expect(normalizeHeaderValue(true)).toBe(true);
    });

    it('decodes Buffer values as utf-8 strings', () => {
        const buf = Buffer.from('hello', 'utf-8');
        expect(normalizeHeaderValue(buf)).toBe('hello');
    });

    it('passes through null and undefined unchanged', () => {
        expect(normalizeHeaderValue(null)).toBe(null);
        expect(normalizeHeaderValue(undefined)).toBe(undefined);
    });

    it('passes through arrays and objects as-is', () => {
        const obj = { nested: 'v' };
        expect(normalizeHeaderValue(obj)).toBe(obj);
        const arr = [1, 2];
        expect(normalizeHeaderValue(arr)).toBe(arr);
    });
});

describe('toEnvelope', () => {
    it('maps body buffer to Uint8Array', () => {
        const msg = {
            body: Buffer.from([1, 2, 3]),
            headers: {},
        } as unknown as Parameters<typeof toEnvelope>[0];
        const env = toEnvelope(msg);
        expect(env.body).toBeInstanceOf(Uint8Array);
        expect([...env.body]).toEqual([1, 2, 3]);
    });

    it('flattens x-headers into the envelope headers map', () => {
        const msg = {
            body: Buffer.alloc(0),
            headers: {
                MessageType: 'OrderCreated',
                RetryCount: 2,
                CustomHeader: Buffer.from('custom-value', 'utf-8'),
            },
        } as unknown as Parameters<typeof toEnvelope>[0];
        const env = toEnvelope(msg);
        expect(env.headers.MessageType).toBe('OrderCreated');
        expect(env.headers.RetryCount).toBe(2);
        expect(env.headers.CustomHeader).toBe('custom-value');
    });
});
