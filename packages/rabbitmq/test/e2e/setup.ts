import { RabbitMQContainer, type StartedRabbitMQContainer } from '@testcontainers/rabbitmq';

let container: StartedRabbitMQContainer | undefined;

export async function setup(): Promise<void> {
    if (process.env.RABBITMQ_URL) {
        return;
    }
    container = await new RabbitMQContainer('rabbitmq:3.13-management-alpine').start();
    // getAmqpUrl() returns amqp://host:port without credentials; embed guest/guest
    // so rabbitmq-client can authenticate via PLAIN.
    const rawUrl = container.getAmqpUrl();
    const withCreds = rawUrl.replace(/^amqp:\/\//, 'amqp://guest:guest@');
    process.env.RABBITMQ_URL = withCreds;
}

export async function teardown(): Promise<void> {
    if (container) {
        await container.stop();
        container = undefined;
    }
}
