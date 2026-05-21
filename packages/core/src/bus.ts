import type { Message } from './message.js';
import type { SendOptions } from './options/send.js';

// Stub for Task 8 — full implementation arrives in Task 11.
// Surfaces the public methods that ConsumeContext.reply() needs to call.
export interface Bus {
  readonly queue: string;
  send<T extends Message>(typeName: string, message: T, options: SendOptions): Promise<void>;
}
