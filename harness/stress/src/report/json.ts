import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface PerDirectionStats {
  attempted: number;
  succeeded: number;
  failed: number;
  p50Ms?: number;
  p95Ms?: number;
  p99Ms?: number;
  maxMs?: number;
}

export interface PatternStats {
  readonly alphaToBeta: PerDirectionStats;
  readonly betaToAlpha: PerDirectionStats;
}

export interface MemoryReport {
  readonly baseline: number;
  readonly final: number;
  readonly deltaMb: number;
  readonly budgetMb: number;
  readonly ok: boolean;
}

export interface ChaosEventReport {
  readonly stoppedAt: string;
  readonly startedAt: string;
  readonly downtimeMs: number;
  readonly recoveryMs: Readonly<Record<string, number>>;
}

export interface ReportShape {
  reportVersion: 1;
  mode: 'smoke' | 'soak' | 'throughput';
  startedAt: string;
  durationSec: number;
  persistence: 'inmemory' | 'mongo';
  chaos?: { enabled: boolean; events: readonly ChaosEventReport[] };
  patterns: Record<string, PatternStats>;
  memory?: MemoryReport;
  fatalError?: string;
  exitCode: 0 | 1 | 2;
}

export async function writeJsonReport(path: string, report: ReportShape): Promise<void> {
  await mkdir(path, { recursive: true });
  await writeFile(join(path, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}
