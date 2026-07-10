# telemetry

Wires `@serviceconnect/telemetry`'s `telemetryProducer` (outbound) and `telemetryConsumeWrapper` (inbound) into a one-message round-trip. An in-memory OTel span exporter captures the emitted spans; the example asserts:

- one `PRODUCER` span with `messaging.operation: 'send'`.
- one `CONSUMER` span with `messaging.operation: 'process'`.
- the consumer span's `parentSpanId` matches the producer span's `spanId`.

## Run

`bash run.sh`

## Expected output

```
[sender] sending OrderPlaced
[receiver] received order-1
[OK] telemetry spans verified: PRODUCER → CONSUMER linked by traceparent
```
