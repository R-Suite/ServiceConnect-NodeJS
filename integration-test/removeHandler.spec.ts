
import { Bus } from '../src/index';
import config from "./config"

describe("Remove Handler", () => {

    let consumer : Bus, producer : Bus;

    afterEach(async () => {
        await consumer?.close();
        await producer?.close();
    })

    it("should stop receiving messages after handler is removed", async () => {
        consumer = new Bus({
            amqpSettings: {
                host: config.host,
                queue: {
                    name: "Test.Consumer",
                    autoDelete: true
                }
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

        let receivedCount = 0;
        const maxMessages = 3;

        const allReceived = new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                if (receivedCount === maxMessages) {
                    resolve();
                } else {
                    reject(new Error(`Expected ${maxMessages} messages but received ${receivedCount}`));
                }
            }, 1500);

            const messageHandler = async (message : {[k:string]: any}) => {
                receivedCount++;
                clearTimeout(timeout);
                setTimeout(() => {
                    if (receivedCount === maxMessages) {
                        resolve();
                    } else {
                        reject(new Error(`Expected ${maxMessages} messages but received ${receivedCount}`));
                    }
                }, 500);
            };

            consumer.addHandler("TestMessageType", messageHandler);
        });

        await producer.send("Test.Consumer", "TestMessageType", { CorrelationId: "1" });
        await producer.send("Test.Consumer", "TestMessageType", { CorrelationId: "2" });
        await producer.send("Test.Consumer", "TestMessageType", { CorrelationId: "3" });

        await allReceived;
    });

    it("should allow dynamic handler addition and removal", async () => {
        consumer = new Bus({
            amqpSettings: {
                host: config.host,
                queue: {
                    name: "Test.Consumer",
                    autoDelete: true
                }
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

        let receivedCount = 0;

        const messageHandler = async (message : {[k:string]: any}) => {
            receivedCount++;
        };

        await consumer.addHandler("TestMessageType", messageHandler);

        await producer.send("Test.Consumer", "TestMessageType", { CorrelationId: "1" });
        await producer.send("Test.Consumer", "TestMessageType", { CorrelationId: "2" });

        await new Promise(resolve => setTimeout(resolve, 200));

        if (receivedCount !== 2) {
            throw new Error(`Expected 2 messages but received ${receivedCount}`);
        }

        await consumer.removeHandler("TestMessageType", messageHandler);

        receivedCount = 0;
        await producer.send("Test.Consumer", "TestMessageType", { CorrelationId: "3" });

        await new Promise(resolve => setTimeout(resolve, 200));

        if (receivedCount !== 0) {
            throw new Error(`Expected 0 messages after removal but received ${receivedCount}`);
        }
    });
});
