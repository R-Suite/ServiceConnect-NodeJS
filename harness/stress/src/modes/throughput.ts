import { RabbitMQContainer, type StartedRabbitMQContainer } from '@testcontainers/rabbitmq';
import type { CliOptions } from '../cli.js';
import { type BusPair, createBusPair } from '../lib/bus-pair.js';
import type { FlowResult, PatternFlow } from '../lib/flow.js';
import type { Logger } from '../lib/log.js';
import { percentile } from '../lib/timer.js';
import { corePatterns } from '../patterns/index.js';
import { createPersistence } from '../persistence/index.js';
import { type PatternStats, type ReportShape, writeJsonReport } from '../report/json.js';
import { writeMarkdownReport } from '../report/markdown.js';

interface DirectionAccumulator {
    attempted: number;
    succeeded: number;
    failed: number;
    durationsMs: number[];
}

function freshAcc(): DirectionAccumulator {
    return { attempted: 0, succeeded: 0, failed: 0, durationsMs: [] };
}

function record(acc: DirectionAccumulator, r: FlowResult): void {
    acc.attempted++;
    if (r.ok) acc.succeeded++;
    else acc.failed++;
    if (r.durationMs > 0) acc.durationsMs.push(r.durationMs);
}

function statsOf(acc: DirectionAccumulator): PatternStats[keyof PatternStats] {
    return {
        attempted: acc.attempted,
        succeeded: acc.succeeded,
        failed: acc.failed,
        p50Ms: percentile(acc.durationsMs, 50),
        p95Ms: percentile(acc.durationsMs, 95),
        p99Ms: percentile(acc.durationsMs, 99),
        maxMs: acc.durationsMs.length === 0 ? undefined : Math.max(...acc.durationsMs),
    };
}

export async function runThroughput(opts: CliOptions, log: Logger): Promise<ReportShape> {
    log.info('throughput: starting', { rate: opts.rate, durationSec: opts.durationSec });

    let container: StartedRabbitMQContainer | undefined;
    let brokerUrl = opts.broker;
    if (!brokerUrl) {
        container = await new RabbitMQContainer('rabbitmq:3.13-management-alpine').start();
        const raw = container.getAmqpUrl();
        brokerUrl = raw.replace(/^amqp:\/\//, 'amqp://guest:guest@');
    }

    const alphaPersistence = await createPersistence(opts.persistence, opts.mongoUri);
    const betaPersistence = await createPersistence(opts.persistence, opts.mongoUri);
    let pair: BusPair | undefined;
    let fatal: string | undefined;
    let exitCode: 0 | 1 = 0;
    const startedAt = new Date();
    const patternStats: Record<string, PatternStats> = {};

    try {
        pair = await createBusPair({ brokerUrl, persistence: alphaPersistence });
        const patterns: readonly PatternFlow[] = corePatterns({
            alphaQueue: pair.alphaQueue,
            betaQueue: pair.betaQueue,
            alphaSagaStore: alphaPersistence.sagaStore,
            betaSagaStore: betaPersistence.sagaStore,
            alphaTimeoutStore: alphaPersistence.timeoutStore,
            betaTimeoutStore: betaPersistence.timeoutStore,
            alphaAggregatorStore: alphaPersistence.aggregatorStore,
            betaAggregatorStore: betaPersistence.aggregatorStore,
        });
        for (const p of patterns) await p.register(pair.alpha, pair.beta);
        await pair.alpha.start();
        await pair.beta.start();
        await new Promise((r) => setTimeout(r, 500));

        const accumulators = new Map<
            string,
            { ab: DirectionAccumulator; ba: DirectionAccumulator }
        >();
        for (const p of patterns) accumulators.set(p.name, { ab: freshAcc(), ba: freshAcc() });

        const tickIntervalMs = Math.max(1, Math.floor(1000 / opts.rate));
        const endAt = Date.now() + opts.durationSec * 1000;
        const inflight: Promise<void>[] = [];
        const MAX_INFLIGHT_TOTAL = opts.rate * patterns.length * 2 * 2;

        while (Date.now() < endAt) {
            for (const p of patterns) {
                const accs = accumulators.get(p.name);
                if (!accs) continue;
                if (inflight.length < MAX_INFLIGHT_TOTAL) {
                    inflight.push(
                        (async () => {
                            const r = await p.drive('alpha-to-beta', opts.flowTimeoutSec * 1000);
                            record(accs.ab, r);
                        })(),
                    );
                    inflight.push(
                        (async () => {
                            const r = await p.drive('beta-to-alpha', opts.flowTimeoutSec * 1000);
                            record(accs.ba, r);
                        })(),
                    );
                }
            }
            await new Promise((r) => setTimeout(r, tickIntervalMs));
        }

        await Promise.allSettled(inflight);

        for (const [name, accs] of accumulators.entries()) {
            patternStats[name] = {
                alphaToBeta: statsOf(accs.ab),
                betaToAlpha: statsOf(accs.ba),
            };
            if (accs.ab.failed > 0 || accs.ba.failed > 0) exitCode = 1;
        }
    } catch (err) {
        fatal = err instanceof Error ? err.message : String(err);
        exitCode = 1;
        log.error(`throughput: fatal: ${fatal}`);
    } finally {
        if (pair) await pair.dispose();
        await betaPersistence.dispose();
        if (container) await container.stop();
    }

    const report: ReportShape = {
        reportVersion: 1,
        mode: 'throughput',
        startedAt: startedAt.toISOString(),
        durationSec: Math.round((Date.now() - startedAt.getTime()) / 1000),
        persistence: opts.persistence,
        patterns: patternStats,
        fatalError: fatal,
        exitCode,
    };
    await writeJsonReport(opts.reportDir, report);
    await writeMarkdownReport(opts.reportDir, report);
    log.info('throughput: report written', { dir: opts.reportDir, exitCode });
    return report;
}
