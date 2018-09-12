//@flow
import type { DeduplicationFilterSettings } from "../types/deduplicationFilterSettings"
import { processIncomingMessage, processOutgoingMessage } from "./filterBase"
import { RedisPresistor } from "../presistors/redisPresistor"

export const incomingDeduplicationFilterRedis = (settings: DeduplicationFilterSettings) =>
    async function filter(message: Object, headers: Object, type: string, bus: Object): Promise<bool> {
        return await processIncomingMessage(new RedisPresistor(settings), headers);
    }


export const outgoingDeduplicationFilterRedis = (settings: DeduplicationFilterSettings) =>
    async function filter(message: Object, headers: Object, type: string, bus: Object): Promise<bool> {
        return await processOutgoingMessage(new RedisPresistor(settings), headers);
    }