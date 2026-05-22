import { RabbitMQContainer, type StartedRabbitMQContainer } from '@testcontainers/rabbitmq';

let container: StartedRabbitMQContainer | undefined;

export async function setup(): Promise<void> {
  if (process.env.RABBITMQ_URL) {
    return;
  }
  container = await new RabbitMQContainer('rabbitmq:3.13-management-alpine').start();
  process.env.RABBITMQ_URL = container.getAmqpUrl();
}

export async function teardown(): Promise<void> {
  if (container) {
    await container.stop();
    container = undefined;
  }
}
