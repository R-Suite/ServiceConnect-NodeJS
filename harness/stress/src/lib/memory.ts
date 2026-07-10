import { performance } from 'node:perf_hooks';

export interface MemorySnapshot {
    readonly takenAt: number;
    readonly heapUsed: number;
    readonly heapTotal: number;
    readonly rss: number;
    readonly external: number;
}

export function snapshot(): MemorySnapshot {
    const m = process.memoryUsage();
    return {
        takenAt: performance.now(),
        heapUsed: m.heapUsed,
        heapTotal: m.heapTotal,
        rss: m.rss,
        external: m.external,
    };
}

export interface BudgetCheck {
    readonly ok: boolean;
    readonly deltaMb: number;
}

export function assertBudget(
    baseline: MemorySnapshot,
    final: MemorySnapshot,
    budgetMb: number,
): BudgetCheck {
    const deltaMb = (final.heapUsed - baseline.heapUsed) / 1_048_576;
    return { ok: deltaMb <= budgetMb, deltaMb };
}
