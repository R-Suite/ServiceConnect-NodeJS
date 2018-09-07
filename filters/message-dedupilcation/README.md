# Service-Connect: Deduplication filter

Deduplication filter is used to make sure messages with the same ID are not processed more than once.
Current implementation uses Redis as presistance store, so access to Redis server is required.

## Usage

Register filters when initializing Service Connect.

```
npm install --save service-connect-deduplication
```

```js
import Bus from "service-connect"
import { outgoingDeduplicationFilterRedis, incomingDeduplicationFilterRedis } from "service-connect-deduplication"
import type { DeduplicationFilterSettings } from "service-connect-deduplication"

 const deduplicationFilterSettings = {
        redisSettings: {
            host: "127.0.0.0",
            port: 6379,
            dbIndex: 0
        },
        disableMsgExpiry: false,
        msgExpiryHours: 24
    }

const bus = new Bus({
            amqpSettings: rabbitmqConfig,
            filters: {
                after: [
                    outgoingDeduplicationFilterRedis(deduplicationFilterSettings)
                ],
                before: [
                    incomingDeduplicationFilterRedis(deduplicationFilterSettings)
                ]
            }
        })
```