import { describe, expect, it } from 'vitest';
import { newCorrelationId } from '../src/message.js';

describe('newCorrelationId', () => {
    it('returns a UUIDv4-shaped string', () => {
        const id = newCorrelationId();
        expect(typeof id).toBe('string');
        expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it('returns a fresh id each call', () => {
        expect(newCorrelationId()).not.toBe(newCorrelationId());
    });
});
