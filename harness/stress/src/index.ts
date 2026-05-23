import { CliError, parseCli } from './cli.js';
import { consoleLogger } from './lib/log.js';

async function main(): Promise<number> {
  const log = consoleLogger();
  let opts: ReturnType<typeof parseCli>;
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

  log.warn('mode runners not yet implemented; exiting 0 as a placeholder');
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`fatal: ${err instanceof Error ? err.stack : String(err)}\n`);
    process.exit(2);
  });
