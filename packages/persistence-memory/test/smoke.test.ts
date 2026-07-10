import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from '../src/index.js';

describe('@serviceconnect/persistence-memory', () => {
    it('exports its package name', () => {
        expect(PACKAGE_NAME).toBe('@serviceconnect/persistence-memory');
    });
});
