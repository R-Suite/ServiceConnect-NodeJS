import { describe, expect, it, vi } from 'vitest';
import { type Logger, consoleLogger } from '../src/logger.js';

describe('consoleLogger', () => {
    it('writes JSON to stdout for each level at or above the threshold', () => {
        const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
        try {
            const log = consoleLogger('info');
            log.trace('hidden');
            log.debug('hidden');
            log.info('visible-info');
            log.warn('visible-warn');
            log.error('visible-error');
            log.fatal('visible-fatal');
            expect(writeSpy).toHaveBeenCalledTimes(4);
            for (const call of writeSpy.mock.calls) {
                const line = call[0] as string;
                expect(line.endsWith('\n')).toBe(true);
                const parsed = JSON.parse(line);
                expect(parsed).toHaveProperty('level');
                expect(parsed).toHaveProperty('msg');
                expect(parsed).toHaveProperty('time');
            }
        } finally {
            writeSpy.mockRestore();
        }
    });

    it('attaches meta as flattened JSON fields', () => {
        const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
        try {
            const log = consoleLogger('trace');
            log.info('msg', { messageId: 'abc', size: 42 });
            const line = writeSpy.mock.calls[0]?.[0] as string;
            const parsed = JSON.parse(line);
            expect(parsed.messageId).toBe('abc');
            expect(parsed.size).toBe(42);
        } finally {
            writeSpy.mockRestore();
        }
    });

    it('child() returns a new logger with merged bindings', () => {
        const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
        try {
            const parent = consoleLogger('trace');
            const child = parent.child?.({ correlationId: 'cor-1' });
            expect(child).toBeDefined();
            child?.info('msg', { extra: 'meta' });
            const line = writeSpy.mock.calls[0]?.[0] as string;
            const parsed = JSON.parse(line);
            expect(parsed.correlationId).toBe('cor-1');
            expect(parsed.extra).toBe('meta');
        } finally {
            writeSpy.mockRestore();
        }
    });

    it('defaults to info level when no argument is given', () => {
        const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
        try {
            const log = consoleLogger();
            log.debug('hidden');
            log.info('visible');
            expect(writeSpy).toHaveBeenCalledTimes(1);
        } finally {
            writeSpy.mockRestore();
        }
    });

    it('shape conforms to the Logger interface', () => {
        const log: Logger = consoleLogger();
        expect(typeof log.trace).toBe('function');
        expect(typeof log.debug).toBe('function');
        expect(typeof log.info).toBe('function');
        expect(typeof log.warn).toBe('function');
        expect(typeof log.error).toBe('function');
        expect(typeof log.fatal).toBe('function');
        expect(typeof log.child).toBe('function');
    });
});
