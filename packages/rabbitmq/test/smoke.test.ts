import { describe, expect, it } from 'vitest';
import { CORE_DEPENDENCY, PACKAGE_NAME } from '../src/index.js';

describe('@serviceconnect/rabbitmq', () => {
  it('exports its package name', () => {
    expect(PACKAGE_NAME).toBe('@serviceconnect/rabbitmq');
  });

  it('imports the core package name across the workspace', () => {
    expect(CORE_DEPENDENCY).toBe('@serviceconnect/core');
  });
});
