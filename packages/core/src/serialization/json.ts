import { TerminalDeserializationError, ValidationError } from '../errors.js';
import type { Message } from '../message.js';
import type { IMessageTypeRegistry } from './registry.js';
import type { IMessageSerializer } from './serializer.js';
import type { StandardSchemaV1 } from './standard-schema.js';

export function jsonSerializer(registry: IMessageTypeRegistry): IMessageSerializer {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8', { fatal: true });

  function validateOrThrow<T>(schema: StandardSchemaV1<T>, value: unknown): T {
    const result = schema['~standard'].validate(value);
    if (result instanceof Promise) {
      throw new ValidationError('schema validation must be synchronous for the JSON serializer');
    }
    if ('issues' in result && result.issues) {
      const summary = result.issues.map((issue) => issue.message).join('; ');
      throw new ValidationError(`schema validation failed: ${summary}`);
    }
    return (result as { value: T }).value;
  }

  return {
    serialize<T extends Message>(message: T): Uint8Array {
      const json = JSON.stringify(message);
      return encoder.encode(json);
    },
    deserialize<T extends Message>(bytes: Uint8Array, typeName: string): T {
      let text: string;
      try {
        text = decoder.decode(bytes);
      } catch (cause) {
        throw new TerminalDeserializationError(`payload is not valid utf-8 for ${typeName}`, cause);
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (cause) {
        throw new TerminalDeserializationError(`payload is not valid JSON for ${typeName}`, cause);
      }
      const registration = registry.resolve(typeName);
      if (registration?.schema) {
        return validateOrThrow(registration.schema as StandardSchemaV1<T>, parsed);
      }
      return parsed as T;
    },
  };
}
