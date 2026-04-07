
import { Bus } from '../src/index';
import config from "./config"

const pollWithDeadline = (check: () => boolean, deadline: number = 30000): Promise<void> => {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const interval = setInterval(() => {
            if (check()) { clearInterval(interval); resolve(); }
            else if (Date.now() - start > deadline) {
                clearInterval(interval);
                reject(new Error(`Poll deadline exceeded after ${deadline}ms`));
            }
        }, 100);
    });
};

describe("Retries", () => {

    let consumer : Bus, producer : Bus;

    afterEach(async () => {
        await consumer?.close();
        await producer?.close();
    })

    it("should retry message 3 times if exception is thrown", async () => {
        consumer = new Bus({
            amqpSettings: {
                host: config.host,
                queue: {
                    name: "Test.Consumer.RetryTest",
                    autoDelete: true
                },
                maxRetries: 3,
                retryDelay: 50
            }
        });

        producer = new Bus({
            amqpSettings: {
                host: config.host,
                queue: {
                    name: "Test.Producer.RetryTest",
                    autoDelete: true
                }
            }
        });

        await consumer.init();
        await producer.init();

        let count = 0;

        const messageHandler = async (message : {[k:string]: any}) => {
            count++;
            if (count < 4) {
                throw new Error("Retry test")
            }
        };

        await consumer.addHandler("TestMessageType", messageHandler);

        await producer.send("Test.Consumer.RetryTest", "TestMessageType", {
            CorrelationId: "123"
        });

        // Wait for retries to complete
        await pollWithDeadline(() => count >= 4);
    });

});
