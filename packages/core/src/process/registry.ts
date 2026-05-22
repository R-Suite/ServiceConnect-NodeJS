import { InvalidOperationError } from '../errors.js';
import type { Message } from '../message.js';
import type { ProcessData } from '../persistence/saga-store.js';
import type { ProcessHandler } from './handler.js';

export interface ProcessRegistration {
  readonly processName: string;
  readonly dataType: string;
  readonly messageType: string;
  readonly isStart: boolean;
  readonly handler: ProcessHandler<ProcessData, Message>;
}

interface ProcessDefinition {
  readonly dataType: string;
}

export class ProcessRegistry {
  private readonly dataTypes = new Set<string>();
  private lastDataType: string | undefined;
  private readonly processes = new Map<string, ProcessDefinition>();
  private readonly byMessageType = new Map<string, ProcessRegistration[]>();

  registerDataType(dataType: string): void {
    this.dataTypes.add(dataType);
    this.lastDataType = dataType;
  }

  isDataTypeRegistered(dataType: string): boolean {
    return this.dataTypes.has(dataType);
  }

  lastRegisteredDataType(): string | undefined {
    return this.lastDataType;
  }

  registerProcess(processName: string, options: { dataType: string }): void {
    if (!this.dataTypes.has(options.dataType)) {
      throw new InvalidOperationError(`process data type '${options.dataType}' is not registered`);
    }
    this.processes.set(processName, { dataType: options.dataType });
  }

  startsWith<TData extends ProcessData, TMessage extends Message>(
    processName: string,
    messageType: string,
    handler: ProcessHandler<TData, TMessage>,
  ): void {
    this.add(processName, messageType, handler as ProcessHandler<ProcessData, Message>, true);
  }

  handles<TData extends ProcessData, TMessage extends Message>(
    processName: string,
    messageType: string,
    handler: ProcessHandler<TData, TMessage>,
  ): void {
    this.add(processName, messageType, handler as ProcessHandler<ProcessData, Message>, false);
  }

  registrationsFor(messageType: string): readonly ProcessRegistration[] {
    return this.byMessageType.get(messageType) ?? [];
  }

  allMessageTypes(): readonly string[] {
    return [...this.byMessageType.keys()];
  }

  processDataType(processName: string): string | undefined {
    return this.processes.get(processName)?.dataType;
  }

  private add(
    processName: string,
    messageType: string,
    handler: ProcessHandler<ProcessData, Message>,
    isStart: boolean,
  ): void {
    const def = this.processes.get(processName);
    if (!def) {
      throw new InvalidOperationError(`process '${processName}' is not registered`);
    }
    const list = this.byMessageType.get(messageType) ?? [];
    list.push({
      processName,
      dataType: def.dataType,
      messageType,
      isStart,
      handler,
    });
    this.byMessageType.set(messageType, list);
  }
}
