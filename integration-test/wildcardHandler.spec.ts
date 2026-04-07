
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

describe("Wildcard Handlers", () => {

    let consumer : Bus, producer : Bus;

    afterEach(async () => {
        await consumer?.close();
        await producer?.close();
    })

    it("should receive messages of any type using wildcard handler", async () => {
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

        let count = 0;
        const receivedTypes : string[] = [];

        const messageHandler = async (message : {[k:string]: any}, headers : {[k:string]: any}) => {
            count++;
            receivedTypes.push(headers.TypeName);
        };

        // Add specific handlers first to create exchanges
        await consumer.addHandler("TestMessageType1", async () => {});
        await consumer.addHandler("TestMessageType2", async () => {});
        await consumer.addHandler("TestMessageType3", async () => {});
        // Then add wildcard handler
        await consumer.addHandler("*", messageHandler);

        await producer.publish("TestMessageType1", { CorrelationId: "1", data: "test1" });
        await producer.publish("TestMessageType2", { CorrelationId: "2", data: "test2" });
        await producer.publish("TestMessageType3", { CorrelationId: "3", data: "test3" });

        await pollWithDeadline(() => count >= 3);

        if (count !== 3) {
            throw new Error(`Expected exactly 3 messages, got ${count}`);
        }

        const expectedTypes = ["TestMessageType1", "TestMessageType2", "TestMessageType3"];
        const sortedReceived = [...receivedTypes].sort();
        const sortedExpected = [...expectedTypes].sort();
        if (JSON.stringify(sortedReceived) !== JSON.stringify(sortedExpected)) {
            throw new Error(`Expected types ${JSON.stringify(sortedExpected)}, got ${JSON.stringify(sortedReceived)}`);
        }
    });

    it("should handle both specific and wildcard handlers", async () => {
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

        let specificCount = 0;
        let wildcardCount = 0;

        const specificHandler = async (message : {[k:string]: any}, headers : {[k:string]: any}) => {
            specificCount++;
        };

        const wildcardHandler = async (message : {[k:string]: any}, headers : {[k:string]: any}) => {
            wildcardCount++;
        };

        await consumer.addHandler("SpecificType", specificHandler);
        await consumer.addHandler("*", wildcardHandler);

        await producer.publish("SpecificType", { CorrelationId: "1", data: "test" });

        await pollWithDeadline(() => specificCount >= 1 && wildcardCount >= 1);

        if (specificCount !== 1) {
            throw new Error(`Expected exactly 1 specific handler call, got ${specificCount}`);
        }
        if (wildcardCount !== 1) {
            throw new Error(`Expected exactly 1 wildcard handler call, got ${wildcardCount}`);
        }
    });
});
