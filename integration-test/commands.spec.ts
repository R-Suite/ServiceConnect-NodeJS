
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

describe("Commands", () => {

    let consumer : Bus, producer : Bus;

    afterEach(async () => {
        await consumer?.close();
        await producer?.close();
    })

    it("should send and receive all events", async () => {
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
        const receivedNumbers : number[] = [];

        const messageHandler = async (message : {[k:string]: any}) => {
            count++;
            receivedNumbers.push(message.number);
        };

        await consumer.addHandler("TestMessageType", messageHandler);

        for (let i = 0; i < 10; i++) {
            await producer.send("Test.Consumer", "TestMessageType", {
                CorrelationId: "123",
                number: i
            });
        }

        await pollWithDeadline(() => count >= 10);

        if (count !== 10) {
            throw new Error(`Expected exactly 10 messages, got ${count}`);
        }

        const sorted = [...receivedNumbers].sort((a, b) => a - b);
        for (let i = 0; i < 10; i++) {
            if (sorted[i] !== i) {
                throw new Error(`Missing message number ${i}. Received: ${JSON.stringify(sorted)}`);
            }
        }
    });

});
