---
'@serviceconnect/persistence-mongodb': minor
---

Phase F lands `@serviceconnect/persistence-mongodb` with three stores — `mongoSagaStore`, `mongoAggregatorStore`, `mongoTimeoutStore` — backed by MongoDB v6. Each factory takes a `Db` instance from the official `mongodb` driver (caller owns the `MongoClient` lifecycle) and exposes an `ensureIndexes()` lifecycle method. Saga store uses a compound `_id` and a numeric `version` field for optimistic concurrency. Aggregator store stores one document per buffered message with `claimedBy`/`claimExpiresAt` lease fields. Timeout store indexes `runAt` for poller scans. All three pass the same contract suites exported from `@serviceconnect/core/testing/persistence/*` that the InMemory backend passes, plus eleven Mongo-specific extras (index existence, concurrent insert/update races, lease safety, producer-race uniqueness, timeout claim ordering).
