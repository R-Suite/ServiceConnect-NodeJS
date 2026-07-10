export type Mode = 'smoke' | 'soak' | 'throughput';
export type Persistence = 'inmemory' | 'mongo';
export type ChaosKind = 'none' | 'testcontainers';

export interface CliOptions {
    readonly mode: Mode;
    readonly durationSec: number;
    readonly rate: number;
    readonly patterns: readonly string[] | 'all';
    readonly persistence: Persistence;
    readonly chaos: ChaosKind;
    readonly chaosIntervalSec: number;
    readonly chaosDowntimeSec: number;
    readonly broker?: string;
    readonly mongoUri?: string;
    readonly flowTimeoutSec: number;
    readonly memoryBudgetMb: number;
    readonly reportDir: string;
}

export class CliError extends Error {
    override readonly name = 'CliError';
}

const HELP = `\
Usage: tsx src/index.ts [options]

Options:
  --mode smoke|soak|throughput   default: smoke
  --duration <seconds>           default: 30 (smoke) / 300 (soak/throughput)
  --rate <flows/sec/pattern>     throughput only; default: 10
  --patterns <list>              comma-separated; default: all
  --persistence inmemory|mongo   default: inmemory
  --chaos none|testcontainers    default: none; requires --mode soak
  --chaos-interval <seconds>     default: 30
  --chaos-downtime <seconds>     default: 20
  --broker <amqp-url>            when absent, harness boots its own testcontainer
  --mongo <mongodb-uri>          required when --persistence mongo
  --flow-timeout <seconds>       default: 10
  --memory-budget-mb <int>       soak only; default: 256
  --report-dir <path>            default: ./out
  --help
`;

function readValue(argv: readonly string[], i: number, flag: string): string {
    const v = argv[i];
    if (v === undefined) throw new CliError(`${flag} requires a value`);
    return v;
}

function readInt(value: string, flag: string): number {
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n)) throw new CliError(`${flag} requires an integer, got '${value}'`);
    return n;
}

export function parseCli(argv: readonly string[]): CliOptions {
    let mode: Mode = 'smoke';
    let durationSec: number | undefined;
    let rate = 10;
    let patterns: readonly string[] | 'all' = 'all';
    let persistence: Persistence = 'inmemory';
    let chaos: ChaosKind = 'none';
    let chaosIntervalSec = 30;
    let chaosDowntimeSec = 20;
    let broker: string | undefined;
    let mongoUri: string | undefined;
    let flowTimeoutSec = 10;
    let memoryBudgetMb = 256;
    let reportDir = './out';

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i] as string;
        switch (arg) {
            case '--help':
            case '-h':
                process.stdout.write(HELP);
                process.exit(0);
                break;
            case '--mode': {
                const v = readValue(argv, ++i, '--mode');
                if (v !== 'smoke' && v !== 'soak' && v !== 'throughput') {
                    throw new CliError(`--mode must be smoke|soak|throughput, got '${v}'`);
                }
                mode = v;
                break;
            }
            case '--duration':
                durationSec = readInt(readValue(argv, ++i, '--duration'), '--duration');
                break;
            case '--rate':
                rate = readInt(readValue(argv, ++i, '--rate'), '--rate');
                break;
            case '--patterns': {
                const v = readValue(argv, ++i, '--patterns');
                patterns =
                    v === 'all'
                        ? 'all'
                        : v
                              .split(',')
                              .map((s) => s.trim())
                              .filter((s) => s !== '');
                break;
            }
            case '--persistence': {
                const v = readValue(argv, ++i, '--persistence');
                if (v !== 'inmemory' && v !== 'mongo') {
                    throw new CliError(`--persistence must be inmemory|mongo, got '${v}'`);
                }
                persistence = v;
                break;
            }
            case '--chaos': {
                const v = readValue(argv, ++i, '--chaos');
                if (v !== 'none' && v !== 'testcontainers') {
                    throw new CliError(`--chaos must be none|testcontainers, got '${v}'`);
                }
                chaos = v;
                break;
            }
            case '--chaos-interval':
                chaosIntervalSec = readInt(
                    readValue(argv, ++i, '--chaos-interval'),
                    '--chaos-interval',
                );
                break;
            case '--chaos-downtime':
                chaosDowntimeSec = readInt(
                    readValue(argv, ++i, '--chaos-downtime'),
                    '--chaos-downtime',
                );
                break;
            case '--broker':
                broker = readValue(argv, ++i, '--broker');
                break;
            case '--mongo':
                mongoUri = readValue(argv, ++i, '--mongo');
                break;
            case '--flow-timeout':
                flowTimeoutSec = readInt(readValue(argv, ++i, '--flow-timeout'), '--flow-timeout');
                break;
            case '--memory-budget-mb':
                memoryBudgetMb = readInt(
                    readValue(argv, ++i, '--memory-budget-mb'),
                    '--memory-budget-mb',
                );
                break;
            case '--report-dir':
                reportDir = readValue(argv, ++i, '--report-dir');
                break;
            default:
                throw new CliError(`unknown argument: '${arg}' (use --help)`);
        }
    }

    if (chaos === 'testcontainers' && mode !== 'soak') {
        throw new CliError('--chaos testcontainers requires --mode soak');
    }

    const finalDuration = durationSec ?? (mode === 'smoke' ? 30 : 300);

    return {
        mode,
        durationSec: finalDuration,
        rate,
        patterns,
        persistence,
        chaos,
        chaosIntervalSec,
        chaosDowntimeSec,
        broker,
        mongoUri,
        flowTimeoutSec,
        memoryBudgetMb,
        reportDir,
    };
}
