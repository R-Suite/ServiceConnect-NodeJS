//@flow
import type { RedisSettings } from "./redisSettings"

export type DeduplicationFilterSettings = {
    redisSettings: RedisSettings,
    disableMsgExpiry : bool,
    msgExpiryHours: number
}