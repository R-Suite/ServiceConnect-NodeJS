
import { Bus } from '../src/index';
import config from "./config"

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

        const allReceived = new Promise<void>((resolve) => {
            const messageHandler = async (message : {[k:string]: any}, headers : {[k:string]: any}) => {
                count++;
                receivedTypes.push(headers.TypeName);
                if (count === 3) {
                    resolve();
                }
            };

            // Add specific handlers first to create exchanges
            consumer.addHandler("TestMessageType1", async () => {});
            consumer.addHandler("TestMessageType2", async () => {});
            consumer.addHandler("TestMessageType3", async () => {});
            // Then add wildcard handler
            consumer.addHandler("*", messageHandler);
        });

        await producer.publish("TestMessageType1", { CorrelationId: "1", data: "test1" });
        await producer.publish("TestMessageType2", { CorrelationId: "2", data: "test2" });
        await producer.publish("TestMessageType3", { CorrelationId: "3", data: "test3" });

        await allReceived;
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

        const allReceived = new Promise<void>((resolve) => {
            const specificHandler = async (message : {[k:string]: any}, headers : {[k:string]: any}) => {
                specificCount++;
                if (specificCount === 1 && wildcardCount === 1) {
                    resolve();
                }
            };

            const wildcardHandler = async (message : {[k:string]: any}, headers : {[k:string]: any}) => {
                wildcardCount++;
                if (specificCount === 1 && wildcardCount === 1) {
                    resolve();
                }
            };

            consumer.addHandler("SpecificType", specificHandler);
            consumer.addHandler("*", wildcardHandler);
        });

        await producer.publish("SpecificType", { CorrelationId: "1", data: "test" });

        await allReceived;
    });
});
