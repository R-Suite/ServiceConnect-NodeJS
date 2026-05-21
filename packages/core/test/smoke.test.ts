import { describe, expect, it } from 'vitest';
import { FilterAction, PACKAGE_NAME, createBus } from '../src/index.js';
import { fakeTransport } from '../src/testing/index.js';

describe('@serviceconnect/core public surface', () => {
  it('exports PACKAGE_NAME for downstream probe', () => {
    expect(PACKAGE_NAME).toBe('@serviceconnect/core');
  });

  it('exports FilterAction enum-like object', () => {
    expect(FilterAction.Continue).toBe('Continue');
    expect(FilterAction.Stop).toBe('Stop');
  });

  it('createBus + fakeTransport compose without throwing', () => {
    const t = fakeTransport();
    const bus = createBus({ transport: t, queue: { name: 'q' } });
    expect(bus.queue).toBe('q');
  });
});
