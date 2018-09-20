//@flow
import type { DeduplicationFilterSettings } from "../types/deduplicationFilterSettings"
import { processIncomingMessage, processOutgoingMessage } from "./filterBase"
import { RedisPresistor } from "../presistors/redisPresistor"

export const incomingDeduplicationFilterRedis = (settings: DeduplicationFilterSettings) => {
    const redis = new RedisPresistor(settings);
    return async function filter(message: Object, headers: Object, type: string, bus: Object): Promise<bool> {
        try {
            return await processIncomingMessage(redis, headers);
        } catch (err) {
            if (settings.logger)
                settings.logger.error({
                    message: `Error processing incomingDeduplicationFilterRedis ${err}`,
                    innerException: err
                });
            return true;
        }
    }
}

export const outgoingDeduplicationFilterRedis = (settings: DeduplicationFilterSettings) => {
    const redis = new RedisPresistor(settings);
    return async function filter(message: Object, headers: Object, type: string, bus: Object): Promise<bool> {
        try {
            return await processOutgoingMessage(redis, headers);
        } catch (err) {
            if (settings.logger)
                settings.logger.error({
                    message: `Error processing outgoingDeduplicationFilterRedis ${err}`,
                    innerException: err
                });
            return true;
        }
    }
}
