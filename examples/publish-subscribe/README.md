# publish-subscribe

Demonstrates `bus.publish` + `bus.handle`. One publisher fans out 3 messages to one subscriber via a fanout exchange.

## Run

`bash run.sh`

## Expected output

```
[publisher] publishing 3 messages
[subscriber] received order-0
[subscriber] received order-1
[subscriber] received order-2
[OK] received all 3 messages
```

## Competing consumers

Start TWO subscribers (run two copies of `src/index.ts` simultaneously, or use multiple shells) — both bind to the same queue name and will compete-consume from the fanout exchange. RabbitMQ handles the round-robin distribution natively; no framework code change required.
