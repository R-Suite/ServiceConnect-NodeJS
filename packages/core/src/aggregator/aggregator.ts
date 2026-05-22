import type { Message } from '../message.js';

export abstract class Aggregator<T extends Message> {
  abstract batchSize(): number;
  abstract timeout(): number;
  abstract execute(messages: readonly T[], signal: AbortSignal): Promise<void>;
}
