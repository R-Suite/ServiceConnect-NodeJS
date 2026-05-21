import { describe, expect, it } from 'vitest';
import { createMessageTypeRegistry } from '../../src/serialization/registry.js';

describe('createMessageTypeRegistry', () => {
  it('returns undefined for an unknown name', () => {
    const reg = createMessageTypeRegistry();
    expect(reg.resolve('Nope')).toBeUndefined();
  });

  it('register/resolve round-trips a name without schema', () => {
    const reg = createMessageTypeRegistry();
    reg.register('OrderCreated');
    expect(reg.resolve('OrderCreated')).toEqual({ typeName: 'OrderCreated' });
  });

  it('register/resolve round-trips a name with schema', () => {
    const reg = createMessageTypeRegistry();
    const schema = {
      '~standard': {
        version: 1 as const,
        vendor: 'test',
        validate: (v: unknown) => ({ value: v }),
      },
    };
    reg.register('OrderCreated', { schema });
    const resolved = reg.resolve('OrderCreated');
    expect(resolved?.schema).toBe(schema);
  });

  it('re-registering the same name with the same schema is idempotent', () => {
    const reg = createMessageTypeRegistry();
    reg.register('OrderCreated');
    expect(() => reg.register('OrderCreated')).not.toThrow();
  });

  it('re-registering the same name with a different schema throws', () => {
    const reg = createMessageTypeRegistry();
    const schemaA = {
      '~standard': { version: 1 as const, vendor: 'a', validate: (v: unknown) => ({ value: v }) },
    };
    const schemaB = {
      '~standard': { version: 1 as const, vendor: 'b', validate: (v: unknown) => ({ value: v }) },
    };
    reg.register('OrderCreated', { schema: schemaA });
    expect(() => reg.register('OrderCreated', { schema: schemaB })).toThrow(
      /already registered with a different schema/,
    );
  });

  it('allRegisteredNames returns a frozen snapshot detached from later registrations', () => {
    const reg = createMessageTypeRegistry();
    reg.register('A');
    reg.register('B');
    const snap = reg.allRegisteredNames();
    expect([...snap].sort()).toEqual(['A', 'B']);
    reg.register('C');
    expect([...snap].sort()).toEqual(['A', 'B']);
  });
});
