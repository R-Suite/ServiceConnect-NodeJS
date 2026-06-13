import { randomUUID } from 'node:crypto';
import { type Db, MongoClient } from 'mongodb';

let client: MongoClient | undefined;
const cleanupTasks: (() => Promise<void>)[] = [];

async function ensureClient(): Promise<MongoClient> {
    if (!client) {
        const uri = process.env.MONGODB_URI;
        if (!uri) {
            throw new Error('MONGODB_URI is not set; check the globalSetup');
        }
        client = await MongoClient.connect(uri);
    }
    return client;
}

export async function freshDb(): Promise<Db> {
    const c = await ensureClient();
    const dbName = `db-${randomUUID().slice(0, 8)}`;
    const db = c.db(dbName);
    cleanupTasks.push(async () => {
        await db.dropDatabase().catch(() => undefined);
    });
    return db;
}

export async function disconnect(): Promise<void> {
    await Promise.all(cleanupTasks.splice(0).map((t) => t()));
    if (client) {
        await client.close();
        client = undefined;
    }
}
