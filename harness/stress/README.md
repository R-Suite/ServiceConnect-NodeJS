# `@serviceconnect/stress-harness`

Private workspace member — not published. Drives every ServiceConnect pattern across two `Bus` instances concurrently to catch cross-tenant leaks, memory regressions, and broker-recovery failures.

## Usage

```bash
pnpm --filter @serviceconnect/stress-harness smoke
pnpm --filter @serviceconnect/stress-harness soak
pnpm --filter @serviceconnect/stress-harness throughput
```

See `src/cli.ts` for the full flag surface.

## Modes

- `smoke` — every pattern fires once in each direction (~30s). CI-friendly.
- `soak` — looped flows for `--duration` seconds with memory budget assertion.
- `throughput` — rate-controlled flows with per-pattern latency percentiles.

## Output

Each run writes `out/report.json` and `out/report.md`.

Exit code:
- `0` — every flow passed, every process-level assertion held.
- `1` — at least one flow failed or an assertion (memory budget, chaos recovery) fired.
- `2` — CLI or startup error.
