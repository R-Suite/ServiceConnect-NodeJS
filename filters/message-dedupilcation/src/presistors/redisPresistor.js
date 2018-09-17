//@flow
import { Presistor } from "./presistor"
import type { DeduplicationFilterSettings } from "../types/deduplicationFilterSettings"
import redis from "redis"
import bluebird from "bluebird"


export class RedisPresistor implements Presistor {
    redisClient: any = null;
    disableMessageExpiry: bool = false;
    msgExpiryHours: number = 1;

    constructor(settings: DeduplicationFilterSettings) {
        bluebird.promisifyAll(redis.RedisClient.prototype);
        this.redisClient = redis.createClient({
            host: settings.redisSettings.host,
            port: settings.redisSettings.port,
            db: settings.redisSettings.dbIndex
        });
    }

    messageExists = async (id: string): Promise<bool> => {
        if (this.redisClient) {
            try {
                let messageValue: any = await this.redisClient.getAsync(id);
                return (messageValue !== null && messageValue !== undefined);
            } catch (err) {
                throw `Error getting message id: ${id} from Redis: ${err}`;
            }
        } else {
            throw `Error getting message id: ${id}. Redis client is not initiated`;
        }
    }

    insert = async (id: string): Promise<void> => {
        if (this.redisClient) {
            try {
                if (this.disableMessageExpiry)
                    await this.redisClient.setAsync(id, "");
                else
                    await this.redisClient.setAsync(id, "", 'EX', 3600 * this.msgExpiryHours);
            } catch (err) {
                throw `Error inserting id: ${id} to Redis: ${err}`;
            }
        } else {
            throw `Error inserting id: ${id}. Redis client is not initiated`;
        }
    }

    close = async (): Promise<void> => {
        try {
            if (this.redisClient) {
                await this.redisClient.quitAsync();
            }
        } catch (err) {
            throw `Error closing Redis connection ${err}`;
        }
    }
}
