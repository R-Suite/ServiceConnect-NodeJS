import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ReportShape } from './json.js';

export async function writeMarkdownReport(path: string, report: ReportShape): Promise<void> {
    await mkdir(path, { recursive: true });
    const lines: string[] = [];
    lines.push(`# Stress harness report (${report.mode})`, '');
    lines.push(`- Started: \`${report.startedAt}\``);
    lines.push(`- Duration: ${report.durationSec}s`);
    lines.push(`- Persistence: \`${report.persistence}\``);
    lines.push(`- Exit code: ${report.exitCode}`);
    if (report.fatalError) lines.push(`- Fatal: \`${report.fatalError}\``);
    lines.push('');

    lines.push('## Patterns', '');
    lines.push('| Pattern | Direction | Attempted | Succeeded | Failed | p50 | p95 | p99 | Max |');
    lines.push('|---|---|---:|---:|---:|---:|---:|---:|---:|');
    for (const [name, stats] of Object.entries(report.patterns)) {
        for (const dir of ['alphaToBeta', 'betaToAlpha'] as const) {
            const s = stats[dir];
            lines.push(
                `| ${name} | ${dir} | ${s.attempted} | ${s.succeeded} | ${s.failed} | ${s.p50Ms ?? '-'} | ${s.p95Ms ?? '-'} | ${s.p99Ms ?? '-'} | ${s.maxMs ?? '-'} |`,
            );
        }
    }
    lines.push('');

    if (report.memory) {
        lines.push('## Memory', '');
        lines.push(`- Baseline: ${(report.memory.baseline / 1_048_576).toFixed(1)} MB`);
        lines.push(`- Final: ${(report.memory.final / 1_048_576).toFixed(1)} MB`);
        lines.push(`- Delta: ${report.memory.deltaMb.toFixed(1)} MB`);
        lines.push(`- Budget: ${report.memory.budgetMb} MB`);
        lines.push(`- Status: ${report.memory.ok ? 'PASS' : 'FAIL'}`);
        lines.push('');
    }

    if (report.chaos?.enabled) {
        lines.push('## Chaos', '');
        for (const ev of report.chaos.events) {
            lines.push(`- ${ev.stoppedAt} → ${ev.startedAt} (downtime ${ev.downtimeMs}ms)`);
            for (const [pattern, ms] of Object.entries(ev.recoveryMs)) {
                lines.push(`  - ${pattern} recovered in ${ms}ms`);
            }
        }
        lines.push('');
    }

    await writeFile(join(path, 'report.md'), lines.join('\n'), 'utf8');
}
