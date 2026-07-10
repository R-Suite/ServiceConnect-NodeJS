# aggregator

An `OrderBatchAggregator extends Aggregator<OrderEvent>` collects 3 messages into a batch (`batchSize: 3`). The publisher emits 3 messages quickly; the aggregator's `execute` runs once with all three.

## Run

`bash run.sh`

## Expected output

```
[publisher] publishing 3 OrderEvent messages
[aggregator] received batch of 3
[OK] aggregator received expected batch
```
