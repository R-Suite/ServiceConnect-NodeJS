import { MongoDBContainer, type StartedMongoDBContainer } from '@testcontainers/mongodb';
import { disconnect } from './helpers.js';

let container: StartedMongoDBContainer | undefined;

export async function setup(): Promise<void> {
  if (process.env.MONGODB_URI) {
    return;
  }
  container = await new MongoDBContainer('mongo:7').start();
  process.env.MONGODB_URI = `${container.getConnectionString()}?directConnection=true`;
}

export async function teardown(): Promise<void> {
  await disconnect();
  if (container) {
    await container.stop();
    container = undefined;
  }
}
