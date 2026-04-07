
import { Bus } from '../src/index';
import config from "./config"

describe("Audit Queue", () => {

    let consumer : Bus, producer : Bus;

    afterEach(async () => {
        await consumer?.close();
        await producer?.close();
    })

    it("should send successfully processed messages to audit queue", async () => {
        consumer = new Bus({
            amqpSettings: {
                host: config.host,
                queue: {
                    name: "Test.Consumer",
                    autoDelete: true
                },
                auditEnabled: true,
                auditQueue: "Test.Consumer.Audit"
            }
        });

        producer = new Bus({
            amqpSettings: {
                host: config.host,
                queue: {
                    name: "Test.Producer",
                    autoDelete: true
                }
            }
        });

        await consumer.init();
        await producer.init();

        const messageReceived = new Promise<void>((resolve) => {
            const messageHandler = async (message : {[k:string]: any}) => {
                resolve();
            };

            consumer.addHandler("TestMessageType", messageHandler);
        });

        await producer.send("Test.Consumer", "TestMessageType", { CorrelationId: "123" });

        await messageReceived;

        // TODO (#23): After the handler resolves, consume from the "Test.Consumer.Audit"
        // queue and assert that the message is present. This requires creating a separate
        // AMQP connection to directly consume from the audit queue and verify the message
        // was forwarded there after successful processing.
    });
});
