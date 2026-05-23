import { RabbitMQContainer, type StartedRabbitMQContainer } from '@testcontainers/rabbitmq';
import type { CliOptions } from '../cli.js';
import { type BusPair, createBusPair } from '../lib/bus-pair.js';
import type { FlowResult, PatternFlow } from '../lib/flow.js';
import type { Logger } from '../lib/log.js';
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

async function runWithFilter(
  p: PatternFlow,
  dir: 'alpha-to-beta' | 'beta-to-alpha',
  timeoutMs: number,
): Promise<FlowResult> {
  try {
    return await p.drive(dir, timeoutMs);
  } catch (err) {
    return {
      ok: false,
      durationMs: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function runSmoke(opts: CliOptions, log: Logger): Promise<ReportShape> {
  log.info('smoke: starting');

  let container: StartedRabbitMQContainer | undefined;
  let brokerUrl = opts.broker;
  if (!brokerUrl) {
    log.info('smoke: starting rabbitmq testcontainer');
    container = await new RabbitMQContainer('rabbitmq:3.13-management-alpine').start();
    const raw = container.getAmqpUrl();
    brokerUrl = raw.replace(/^amqp:\/\//, 'amqp://guest:guest@');
    log.info('smoke: rabbitmq ready', { url: brokerUrl });
  }

  const alphaPersistence = await createPersistence(opts.persistence, opts.mongoUri);
  const betaPersistence = await createPersistence(opts.persistence, opts.mongoUri);

  let pair: BusPair | undefined;
  const patternStats: Record<string, PatternStats> = {};
  let fatal: string | undefined;
  let exitCode: 0 | 1 = 0;
  const startedAt = new Date();

  try {
    pair = await createBusPair({ brokerUrl, persistence: alphaPersistence });
    const patterns = corePatterns({
      alphaQueue: pair.alphaQueue,
      betaQueue: pair.betaQueue,
      alphaSagaStore: alphaPersistence.sagaStore,
      betaSagaStore: betaPersistence.sagaStore,
      alphaTimeoutStore: alphaPersistence.timeoutStore,
      betaTimeoutStore: betaPersistence.timeoutStore,
      alphaAggregatorStore: alphaPersistence.aggregatorStore,
      betaAggregatorStore: betaPersistence.aggregatorStore,
    });
    for (const p of patterns) {
      await p.register(pair.alpha, pair.beta);
    }
    await pair.alpha.start();
    await pair.beta.start();
    await new Promise((r) => setTimeout(r, 500));

    const timeoutMs = opts.flowTimeoutSec * 1000;
    for (const p of patterns) {
      patternStats[p.name] = freshStats();
      const ab = await runWithFilter(p, 'alpha-to-beta', timeoutMs);
      recordResult(patternStats[p.name] as PatternStats, 'alphaToBeta', ab);
      const ba = await runWithFilter(p, 'beta-to-alpha', timeoutMs);
      recordResult(patternStats[p.name] as PatternStats, 'betaToAlpha', ba);
      if (!ab.ok) log.error(`smoke: ${p.name} alpha-to-beta failed: ${ab.error}`);
      if (!ba.ok) log.error(`smoke: ${p.name} beta-to-alpha failed: ${ba.error}`);
      if (!ab.ok || !ba.ok) exitCode = 1;
    }
  } catch (err) {
    fatal = err instanceof Error ? err.message : String(err);
    exitCode = 1;
    log.error(`smoke: fatal: ${fatal}`);
  } finally {
    if (pair) await pair.dispose();
    await betaPersistence.dispose();
    if (container) await container.stop();
  }

  const report: ReportShape = {
    reportVersion: 1,
    mode: 'smoke',
    startedAt: startedAt.toISOString(),
    durationSec: Math.round((Date.now() - startedAt.getTime()) / 1000),
    persistence: opts.persistence,
    patterns: patternStats,
    fatalError: fatal,
    exitCode,
  };
  await writeJsonReport(opts.reportDir, report);
  await writeMarkdownReport(opts.reportDir, report);
  log.info('smoke: report written', { dir: opts.reportDir, exitCode });
  return report;
}
