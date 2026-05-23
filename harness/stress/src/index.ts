import { CliError, type CliOptions, parseCli } from './cli.js';
import { consoleLogger } from './lib/log.js';
import { runSmoke } from './modes/smoke.js';

async function dispatch(opts: CliOptions): Promise<number> {
  const log = consoleLogger();
  if (opts.mode === 'smoke') {
    const report = await runSmoke(opts, log);
    return report.exitCode;
  }
  log.warn(`mode ${opts.mode} not yet implemented; exiting 0 as a placeholder`);
  return 0;
}

async function main(): Promise<number> {
  const log = consoleLogger();
  let opts: CliOptions;
  try {
    opts = parseCli(process.argv.slice(2));
  } catch (err) {
    log.error(err instanceof CliError ? err.message : String(err));
    return 2;
  }
  log.info('stress harness starting', {
    mode: opts.mode,
    durationSec: opts.durationSec,
    persistence: opts.persistence,
    chaos: opts.chaos,
  });
  return dispatch(opts);
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`fatal: ${err instanceof Error ? err.stack : String(err)}\n`);
    process.exit(2);
  });
