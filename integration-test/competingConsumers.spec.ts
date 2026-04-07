
import { Bus } from '../src/index';
import config from "./config"

describe("Competing consumers", () => {

    let consumer1 : Bus, consumer2 : Bus, producer : Bus;

    afterEach(async () => {
        await consumer1?.close();
        await consumer2?.close();
        await producer?.close();
    })

    it("should send and receive all events", async () => {
        consumer1 = new Bus({
            amqpSettings: {
                host: config.host,
                queue: {
                    name: "Test.Consumer",
                    autoDelete: true,
                    exclusive: false
                },
                prefetch: 1
            }
        });
        consumer2 = new Bus({
            amqpSettings: {
                host: config.host,
                queue: {
                    name: "Test.Consumer",
                    autoDelete: true,
                    exclusive: false
                },
                prefetch: 1
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

        await consumer1.init();
        await new Promise(resolve => setTimeout(resolve, 100));
        await consumer2.init();
        await producer.init();

        let count1 = 0, count2 = 0;

        const messageHandler1 = async (message : {[k:string]: any}) => {
            count1++;
        };
        const messageHandler2 = async (message : {[k:string]: any}) => {
            count2++;
        };

        await consumer1.addHandler("TestMessageType", messageHandler1);
        await consumer2.addHandler("TestMessageType", messageHandler2);

        for (let i = 0; i < 10; i++) {
            await producer.send("Test.Consumer", "TestMessageType", {
                CorrelationId: "123",
                number: i
            });
        }

        await new Promise(resolve => setTimeout(resolve, 500));

        const total = count1 + count2;
        if (total !== 10) {
            throw new Error(`Expected 10 total messages, got ${total} (count1=${count1}, count2=${count2})`);
        }
        if (count1 === 0 || count2 === 0) {
            throw new Error(`Expected both consumers to receive messages, got count1=${count1} and count2=${count2}`);
        }
    });

});
