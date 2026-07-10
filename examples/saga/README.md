# saga

An `OrderProcess` saga with two steps:
1. `OrderCreated` starts the saga and sets `status: 'pending'`.
2. `PaymentReceived` transitions to `status: 'paid'` and calls `ctx.markComplete()` which deletes the saga row.

The example verifies: the saga row exists after `OrderCreated`, has `status: 'paid'` after `PaymentReceived`, and is deleted after `markComplete`.

## Run

InMemory persistence (default):
`bash run.sh`

MongoDB persistence (uses the docker-compose mongo service):
`bash run.sh --persistence mongo`

## Expected output

```
[saga] using persistence: inmemory
[bus] publishing OrderCreated
[saga] saga is pending after OrderCreated
[bus] publishing PaymentReceived
[saga] saga row deleted after markComplete
[OK] saga lifecycle complete
```
