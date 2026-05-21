import { describe, expect, it } from 'vitest';
import { createBus } from '../../src/bus.js';
import type { Message } from '../../src/message.js';
import { fakeTransport } from '../../src/testing/fake-transport.js';

describe('Phase D stubs', () => {
  it('sendRequest rejects with the Phase D message', async () => {
    const bus = createBus({ transport: fakeTransport(), queue: { name: 'q-self' } });
    await expect(
      bus.sendRequest<Message, Message>('Req', { correlationId: 'c' }, { timeoutMs: 100 }),
    ).rejects.toThrow('not implemented; see Phase D');
  });

  it('sendRequestMulti rejects with the Phase D message', async () => {
    const bus = createBus({ transport: fakeTransport(), queue: { name: 'q-self' } });
    await expect(
      bus.sendRequestMulti<Message, Message>(
        'Req',
        { correlationId: 'c' },
        { timeoutMs: 100, expectedReplyCount: 2 },
      ),
    ).rejects.toThrow('not implemented; see Phase D');
  });

  it('publishRequest rejects with the Phase D message', async () => {
    const bus = createBus({ transport: fakeTransport(), queue: { name: 'q-self' } });
    await expect(
      bus.publishRequest<Message, Message>('Req', { correlationId: 'c' }, () => {}, {
        timeoutMs: 100,
      }),
    ).rejects.toThrow('not implemented; see Phase D');
  });
});
