import { describe, expect, it, vi } from 'vitest';
import type { Bus } from '../src/bus.js';
import { createConsumeContext } from '../src/consume-context.js';
import { consoleLogger } from '../src/logger.js';
import type { CorrelationId, MessageHeaders, MessageId } from '../src/message.js';

function fakeBus(): Bus {
  // Only ctx.reply() touches the bus. We pass a typed-as-Bus object exposing queue + send.
  return {
    queue: 'q-self',
    send: vi.fn(),
  } as unknown as Bus;
}

describe('createConsumeContext', () => {
  const baseHeaders: MessageHeaders = {
    correlationId: 'cor-1' as CorrelationId,
    messageType: 'OrderCreated',
    messageId: 'm-1' as MessageId,
    sourceAddress: 'q-requester',
    requestMessageId: 'req-1' as MessageId,
  };

  it('exposes the headers as a read-only frozen object', () => {
    const ctx = createConsumeContext({
      bus: fakeBus(),
      headers: baseHeaders,
      signal: new AbortController().signal,
      logger: consoleLogger('fatal'),
    });
    expect(Object.isFrozen(ctx.headers)).toBe(true);
  });

  it('exposes messageId, correlationId, messageType from headers', () => {
    const ctx = createConsumeContext({
      bus: fakeBus(),
      headers: baseHeaders,
      signal: new AbortController().signal,
      logger: consoleLogger('fatal'),
    });
    expect(ctx.messageId).toBe('m-1');
    expect(ctx.correlationId).toBe('cor-1');
    expect(ctx.messageType).toBe('OrderCreated');
  });

  it('passes through signal and logger', () => {
    const ac = new AbortController();
    const log = consoleLogger('fatal');
    const ctx = createConsumeContext({
      bus: fakeBus(),
      headers: baseHeaders,
      signal: ac.signal,
      logger: log,
    });
    expect(ctx.signal).toBe(ac.signal);
    expect(typeof ctx.logger.info).toBe('function');
  });

  it('reply() throws when sourceAddress is missing', async () => {
    const headers: MessageHeaders = {
      correlationId: 'cor-1' as CorrelationId,
      messageType: 'X',
    };
    const ctx = createConsumeContext({
      bus: fakeBus(),
      headers,
      signal: new AbortController().signal,
      logger: consoleLogger('fatal'),
    });
    await expect(ctx.reply('Reply', { correlationId: 'cor-1' })).rejects.toThrow(/sourceAddress/);
  });

  it('reply() delegates to bus.send with the source endpoint and responseMessageId header', async () => {
    const bus = fakeBus();
    const ctx = createConsumeContext({
      bus,
      headers: baseHeaders,
      signal: new AbortController().signal,
      logger: consoleLogger('fatal'),
    });
    await ctx.reply('Reply', { correlationId: 'cor-1' }, { headers: { extra: 'x' } });
    expect(bus.send).toHaveBeenCalledOnce();
    const [type, message, options] = (bus.send as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(type).toBe('Reply');
    expect(message).toEqual({ correlationId: 'cor-1' });
    expect(options.endpoint).toBe('q-requester');
    expect(options.headers).toMatchObject({ extra: 'x', responseMessageId: 'req-1' });
  });
});
