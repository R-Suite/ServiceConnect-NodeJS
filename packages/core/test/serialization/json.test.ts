import { describe, expect, it } from 'vitest';
import { TerminalDeserializationError, ValidationError } from '../../src/errors.js';
import type { Message } from '../../src/message.js';
import { jsonSerializer } from '../../src/serialization/json.js';
import { createMessageTypeRegistry } from '../../src/serialization/registry.js';
import type { StandardSchemaV1 } from '../../src/serialization/standard-schema.js';

interface OrderCreated extends Message {
  orderId: string;
  total: number;
}

describe('jsonSerializer', () => {
  it('serialize then deserialize round-trips a message', () => {
    const reg = createMessageTypeRegistry();
    reg.register<OrderCreated>('OrderCreated');
    const ser = jsonSerializer(reg);
    const original: OrderCreated = { correlationId: 'cor-1', orderId: 'ORD-1', total: 99.99 };
    const bytes = ser.serialize(original);
    expect(bytes).toBeInstanceOf(Uint8Array);
    const round = ser.deserialize<OrderCreated>(bytes, 'OrderCreated');
    expect(round).toEqual(original);
  });

  it('throws TerminalDeserializationError on malformed JSON', () => {
    const reg = createMessageTypeRegistry();
    reg.register('OrderCreated');
    const ser = jsonSerializer(reg);
    const garbage = new TextEncoder().encode('{not json');
    expect(() => ser.deserialize(garbage, 'OrderCreated')).toThrow(TerminalDeserializationError);
  });

  it('runs the schema when one is registered', () => {
    const reg = createMessageTypeRegistry();
    const schema: StandardSchemaV1<OrderCreated> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: (value) => {
          const v = value as Partial<OrderCreated>;
          if (typeof v.orderId !== 'string') {
            return { issues: [{ message: 'orderId must be a string' }] };
          }
          return { value: v as OrderCreated };
        },
      },
    };
    reg.register<OrderCreated>('OrderCreated', { schema });
    const ser = jsonSerializer(reg);
    const valid = ser.serialize({ correlationId: 'c', orderId: 'O', total: 1 });
    expect(() => ser.deserialize(valid, 'OrderCreated')).not.toThrow();

    const invalid = new TextEncoder().encode(
      JSON.stringify({ correlationId: 'c', orderId: 42, total: 1 }),
    );
    expect(() => ser.deserialize(invalid, 'OrderCreated')).toThrow(ValidationError);
  });

  it('throws ValidationError when the schema validate function returns a Promise', () => {
    const reg = createMessageTypeRegistry();
    const schema: StandardSchemaV1<OrderCreated> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: (_v) => Promise.resolve({ value: { correlationId: '', orderId: '', total: 0 } }),
      },
    };
    reg.register<OrderCreated>('OrderCreated', { schema });
    const ser = jsonSerializer(reg);
    const bytes = new TextEncoder().encode(
      JSON.stringify({ correlationId: 'c', orderId: 'O', total: 1 }),
    );
    expect(() => ser.deserialize(bytes, 'OrderCreated')).toThrow(/synchronous/);
  });
});
