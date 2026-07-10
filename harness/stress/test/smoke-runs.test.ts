import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..');

describe('stress harness smoke', () => {
    it('exits 0 against testcontainers and writes a passing report', async () => {
        const reportDir = join(REPO_ROOT, 'out');
        const exitCode = await new Promise<number>((resolve, reject) => {
            const child = spawn(
                'node',
                [
                    '--import',
                    'tsx',
                    join(REPO_ROOT, 'src/index.ts'),
                    '--mode',
                    'smoke',
                    '--persistence',
                    'inmemory',
                    '--report-dir',
                    reportDir,
                    '--flow-timeout',
                    '30',
                ],
                { cwd: REPO_ROOT, stdio: 'inherit' },
            );
            child.on('exit', (code) => resolve(code ?? 1));
            child.on('error', reject);
        });
        expect(exitCode).toBe(0);

        const raw = await readFile(join(reportDir, 'report.json'), 'utf8');
        const report = JSON.parse(raw) as {
            mode: string;
            patterns: Record<
                string,
                {
                    alphaToBeta: { succeeded: number; failed: number };
                    betaToAlpha: { succeeded: number; failed: number };
                }
            >;
        };
        expect(report.mode).toBe('smoke');
        for (const [name, stats] of Object.entries(report.patterns)) {
            expect(stats.alphaToBeta.succeeded, `${name} alpha->beta`).toBeGreaterThan(0);
            expect(stats.alphaToBeta.failed, `${name} alpha->beta`).toBe(0);
            expect(stats.betaToAlpha.succeeded, `${name} beta->alpha`).toBeGreaterThan(0);
            expect(stats.betaToAlpha.failed, `${name} beta->alpha`).toBe(0);
        }
    }, 240_000);
});
