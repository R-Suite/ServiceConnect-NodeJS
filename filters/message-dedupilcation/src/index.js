//@flow
import { outgoingDeduplicationFilterRedis, incomingDeduplicationFilterRedis } from "./filters/deduplicationFilterRedis"
export { outgoingDeduplicationFilterRedis, incomingDeduplicationFilterRedis }

import type { DeduplicationFilterSettings } from "./types/deduplicationFilterSettings"
import type { RedisSettings } from "./types/redisSettings"
export type { DeduplicationFilterSettings, RedisSettings }