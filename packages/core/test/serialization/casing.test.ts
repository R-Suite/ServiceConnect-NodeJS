import { describe, expect, it } from 'vitest';
import { camelizeKeys, pascalizeKeys } from '../../src/serialization/casing.js';

describe('casing transforms', () => {
    it('pascalizes top-level and nested object keys', () => {
        expect(pascalizeKeys({ orderId: 'o1', correlationId: 'c' })).toEqual({
            OrderId: 'o1',
            CorrelationId: 'c',
        });
        expect(pascalizeKeys({ child: { grandChild: 1 } })).toEqual({
            Child: { GrandChild: 1 },
        });
    });

    it('recurses into arrays of objects', () => {
        expect(pascalizeKeys({ items: [{ lineId: 1 }, { lineId: 2 }] })).toEqual({
            Items: [{ LineId: 1 }, { LineId: 2 }],
        });
    });

    it('camelizes PascalCase keys back', () => {
        expect(camelizeKeys({ OrderId: 'o1', Child: { GrandChild: 1 } })).toEqual({
            orderId: 'o1',
            child: { grandChild: 1 },
        });
    });

    it('leaves primitives, null, and non-plain values untouched as values', () => {
        expect(pascalizeKeys({ count: 0, flag: false, when: null })).toEqual({
            Count: 0,
            Flag: false,
            When: null,
        });
    });

    it('is a no-op on non-objects', () => {
        expect(pascalizeKeys(5)).toBe(5);
        expect(camelizeKeys('x')).toBe('x');
        expect(pascalizeKeys(null)).toBe(null);
    });
});
