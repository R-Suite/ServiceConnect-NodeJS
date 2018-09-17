//@flow
import type { DeduplicationFilterSettings } from "../types/deduplicationFilterSettings"
import { processIncomingMessage, processOutgoingMessage } from "./filterBase"
import { RedisPresistor } from "../presistors/redisPresistor"

export const incomingDeduplicationFilterRedis = (settings: DeduplicationFilterSettings) =>
    async function filter(message: Object, headers: Object, type: string, bus: Object): Promise<bool> {
        const redis = new RedisPresistor(settings);
        try {
            return await processIncomingMessage(redis, headers);
        } finally {
            if (redis)
                await redis.close();
        }
    }


export const outgoingDeduplicationFilterRedis = (settings: DeduplicationFilterSettings) =>
    async function filter(message: Object, headers: Object, type: string, bus: Object): Promise<bool> {
        const redis = new RedisPresistor(settings);
        try {
            return await processOutgoingMessage(redis, headers);
        } finally {
            if (redis)
                await redis.close();
        }
    }