import { RabbitMQContainer, type StartedRabbitMQContainer } from '@testcontainers/rabbitmq';
import type { BrokerChaos } from '../chaos/index.js';
import { noopChaos } from '../chaos/noop.js';
import { testcontainersChaos } from '../chaos/testcontainers.js';
import type { CliOptions } from '../cli.js';
import { type BusPair, createBusPair } from '../lib/bus-pair.js';
import type { FlowResult, PatternFlow } from '../lib/flow.js';
import type { Logger } from '../lib/log.js';
import { assertBudget, snapshot } from '../lib/memory.js';
import { corePatterns } from '../patterns/index.js';
import { createPersistence } from '../persistence/index.js';
import { type PatternStats, type ReportShape, writeJsonReport } from '../report/json.js';
import { writeMarkdownReport } from '../report/markdown.js';

function freshStats(): PatternStats {
    return {
        alphaToBeta: { attempted: 0, succeeded: 0, failed: 0 },
        betaToAlpha: { attempted: 0, succeeded: 0, failed: 0 },
    };
}

function recordResult(
    stats: PatternStats,
    dir: 'alphaToBeta' | 'betaToAlpha',
    r: FlowResult,
): void {
    const slot = stats[dir];
    slot.attempted++;
    if (r.ok) slot.succeeded++;
    else slot.failed++;
}

export async function runSoak(opts: CliOptions, log: Logger): Promise<ReportShape> {
    log.info('soak: starting', { durationSec: opts.durationSec });

    let container: StartedRabbitMQContainer | undefined;
    let brokerUrl = opts.broker;
    if (!brokerUrl) {
        log.info('soak: starting rabbitmq testcontainer');
        container = await new RabbitMQContainer('rabbitmq:3.13-management-alpine').start();
        const raw = container.getAmqpUrl();
        brokerUrl = raw.replace(/^amqp:\/\//, 'amqp://guest:guest@');
        log.info('soak: rabbitmq ready', { url: brokerUrl });
    }

    const alphaPersistence = await createPersistence(opts.persistence, opts.mongoUri);
    const betaPersistence = await createPersistence(opts.persistence, opts.mongoUri);
    const patternStats: Record<string, PatternStats> = {};
    let fatal: string | undefined;
    let exitCode: 0 | 1 = 0;
    const startedAt = new Date();
    let pair: BusPair | undefined;
    let memoryReport:
        | { baseline: number; final: number; deltaMb: number; budgetMb: number; ok: boolean }
        | undefined;

    const chaos: BrokerChaos =
        opts.chaos === 'testcontainers'
            ? testcontainersChaos({
                  intervalMs: opts.chaosIntervalSec * 1000,
                  downtimeMs: opts.chaosDowntimeSec * 1000,
                  logger: log,
              })
            : noopChaos();

    try {
        await chaos.start();
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

        for (const p of patterns) patternStats[p.name] = freshStats();

        const timeoutMs = opts.flowTimeoutSec * 1000;

        // Warm-up: drive every pattern in both directions for 5s before taking the baseline.
        const warmupUntil = Date.now() + 5_000;
        while (Date.now() < warmupUntil) {
            for (const p of patterns) {
                await p.drive('alpha-to-beta', timeoutMs);
                await p.drive('beta-to-alpha', timeoutMs);
            }
        }
        const baseline = snapshot();

        const endAt = Date.now() + opts.durationSec * 1000;
        while (Date.now() < endAt) {
            for (const p of patterns) {
                const ab = await p.drive('alpha-to-beta', timeoutMs);
                recordResult(patternStats[p.name] as PatternStats, 'alphaToBeta', ab);
                if (!ab.ok) {
                    exitCode = 1;
                    log.error(`soak: ${p.name} alpha-to-beta failed: ${ab.error}`);
                }
                const ba = await p.drive('beta-to-alpha', timeoutMs);
                recordResult(patternStats[p.name] as PatternStats, 'betaToAlpha', ba);
                if (!ba.ok) {
                    exitCode = 1;
                    log.error(`soak: ${p.name} beta-to-alpha failed: ${ba.error}`);
                }
            }
        }

        const final = snapshot();
        const check = assertBudget(baseline, final, opts.memoryBudgetMb);
        memoryReport = {
            baseline: baseline.heapUsed,
            final: final.heapUsed,
            deltaMb: check.deltaMb,
            budgetMb: opts.memoryBudgetMb,
            ok: check.ok,
        };
        if (!check.ok) {
            exitCode = 1;
            log.error(
                `soak: memory budget exceeded (delta ${check.deltaMb.toFixed(1)} MB > ${opts.memoryBudgetMb} MB)`,
            );
        }
    } catch (err) {
        fatal = err instanceof Error ? err.message : String(err);
        exitCode = 1;
        log.error(`soak: fatal: ${fatal}`);
    } finally {
        await chaos.stop();
        if (pair) await pair.dispose();
        await betaPersistence.dispose();
        if (container) await container.stop();
    }

    const chaosEvents = chaos.events();
    const chaosReport =
        opts.chaos === 'testcontainers'
            ? {
                  enabled: true,
                  events: chaosEvents.map((e) => ({
                      stoppedAt: e.stoppedAt.toISOString(),
                      startedAt: e.startedAt.toISOString(),
                      downtimeMs: e.downtimeMs,
                      recoveryMs: {} as Record<string, number>,
                  })),
              }
            : undefined;

    const report: ReportShape = {
        reportVersion: 1,
        mode: 'soak',
        startedAt: startedAt.toISOString(),
        durationSec: Math.round((Date.now() - startedAt.getTime()) / 1000),
        persistence: opts.persistence,
        chaos: chaosReport,
        patterns: patternStats,
        memory: memoryReport,
        fatalError: fatal,
        exitCode,
    };
    await writeJsonReport(opts.reportDir, report);
    await writeMarkdownReport(opts.reportDir, report);
    log.info('soak: report written', { dir: opts.reportDir, exitCode });
    return report;
}
