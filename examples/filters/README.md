# filters

Demonstrates the `beforeConsuming` pipeline with both a `Filter` and `Middleware`:

- **Filter** (`asFilter`) — runs first; returns `FilterAction.Stop` for messages whose `correlationId.startsWith('drop-')`. The handler does NOT run for stopped messages.
- **Middleware** (`asMiddleware`) — runs after all filters pass; records every inbound `correlationId` that was not filtered out.

Pipeline execution order: all registered filters run first in registration order, then all registered middleware (regardless of the interleaved order they were added). A `Stop` result from a filter short-circuits the rest and skips middleware entirely.

Publishes 3 messages: `c-1`, `c-2` (pass the filter and reach middleware + handler), and `drop-1` (stopped by the filter — middleware and handler do not run for it). Asserts the handler ran exactly twice and middleware recorded exactly two correlation IDs.

## Run

`bash run.sh`

## Expected output

```
[publisher] publishing 3 messages (2 normal + 1 drop)
[filter] dropped drop-1
[middleware] saw c-1
[handler] processed c-1
[middleware] saw c-2
[handler] processed c-2
[OK] handler ran twice; filter dropped 1; middleware saw 2
```
