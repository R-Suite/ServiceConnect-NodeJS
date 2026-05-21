import { describe, expect, it } from 'vitest';
import { createBus } from '../../src/bus.js';
import type { Message } from '../../src/message.js';
import { fakeTransport } from '../../src/testing/fake-transport.js';

describe('Phase D stubs', () => {
  it('sendRequest throws with the Phase D message', () => {
    const bus = createBus({ transport: fakeTransport(), queue: { name: 'q-self' } });
    expect(() =>
      bus.sendRequest<Message, Message>('Req', { correlationId: 'c' }, { timeoutMs: 100 }),
    ).toThrow('not implemented; see Phase D');
  });

  it('sendRequestMulti throws with the Phase D message', () => {
    const bus = createBus({ transport: fakeTransport(), queue: { name: 'q-self' } });
    expect(() =>
      bus.sendRequestMulti<Message, Message>(
        'Req',
        { correlationId: 'c' },
        { timeoutMs: 100, expectedReplyCount: 2 },
      ),
    ).toThrow('not implemented; see Phase D');
  });

  it('publishRequest throws with the Phase D message', () => {
    const bus = createBus({ transport: fakeTransport(), queue: { name: 'q-self' } });
    expect(() =>
      bus.publishRequest<Message, Message>('Req', { correlationId: 'c' }, () => {}, {
        timeoutMs: 100,
      }),
    ).toThrow('not implemented; see Phase D');
  });
});
