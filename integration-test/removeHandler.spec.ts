
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

        const messageHandler = async (message : {[k:string]: any}) => {
            receivedCount++;
        };

        await consumer.addHandler("TestMessageType", messageHandler);

        // Send 2 messages and verify they are received
        await producer.send("Test.Consumer", "TestMessageType", { CorrelationId: "1" });
        await producer.send("Test.Consumer", "TestMessageType", { CorrelationId: "2" });

        await new Promise(resolve => setTimeout(resolve, 300));

        if (receivedCount !== 2) {
            throw new Error(`Expected 2 messages before removal but received ${receivedCount}`);
        }

        // Remove handler
        await consumer.removeHandler("TestMessageType", messageHandler);

        // Send more messages — these should NOT be received
        receivedCount = 0;
        await producer.send("Test.Consumer", "TestMessageType", { CorrelationId: "3" });
        await producer.send("Test.Consumer", "TestMessageType", { CorrelationId: "4" });

        await new Promise(resolve => setTimeout(resolve, 300));

        if (receivedCount !== 0) {
            throw new Error(`Expected 0 messages after removal but received ${receivedCount}`);
        }
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
