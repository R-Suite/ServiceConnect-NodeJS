import type { ConsumeContext } from '../consume-context.js';
import type { Message } from '../message.js';

export type HandlerFn<T extends Message> = (message: T, context: ConsumeContext) => Promise<void>;

export interface HandlerClass<T extends Message> {
  handle(message: T, context: ConsumeContext): Promise<void>;
}

export type HandlerFactory<T extends Message> = (
  context: ConsumeContext,
) => HandlerClass<T> | HandlerFn<T>;

export type Handler<T extends Message> =
  | HandlerFn<T>
  | HandlerClass<T>
  | { factory: HandlerFactory<T> };
