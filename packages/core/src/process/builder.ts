import type { Bus } from '../bus.js';
import type { Message } from '../message.js';
import type { ISagaStore, ProcessData } from '../persistence/saga-store.js';
import type { ITimeoutStore } from '../persistence/timeout-store.js';
import type { ProcessHandler } from './handler.js';
import type { ProcessRegistry } from './registry.js';

export interface ProcessRuntimeOptions {
  store: ISagaStore;
  timeoutStore: ITimeoutStore;
}

export interface ProcessBuilder {
  startsWith<TMessage extends Message>(
    messageType: string,
    handler: ProcessHandler<ProcessData, TMessage>,
  ): ProcessBuilder;
  handles<TMessage extends Message>(
    messageType: string,
    handler: ProcessHandler<ProcessData, TMessage>,
  ): ProcessBuilder;
}

export function createProcessBuilder(
  bus: Bus,
  registry: ProcessRegistry,
  processName: string,
): ProcessBuilder {
  const builder: ProcessBuilder = {
    startsWith<TMessage extends Message>(
      messageType: string,
      handler: ProcessHandler<ProcessData, TMessage>,
    ): ProcessBuilder {
      bus.registerMessage(messageType);
      registry.startsWith(processName, messageType, handler);
      return builder;
    },
    handles<TMessage extends Message>(
      messageType: string,
      handler: ProcessHandler<ProcessData, TMessage>,
    ): ProcessBuilder {
      bus.registerMessage(messageType);
      registry.handles(processName, messageType, handler);
      return builder;
    },
  };
  return builder;
}
