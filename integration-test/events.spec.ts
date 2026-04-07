
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

describe("Events", () => {

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
                    name: "Test.Consumer1",
                    autoDelete: true
                }
            }
        });
        consumer2 = new Bus({
            amqpSettings: {
                host: config.host,
                queue: {
                    name: "Test.Consumer2",
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

        await consumer1.init();
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
            await producer.publish("TestMessageType", {
                CorrelationId: "123",
                number: i
            });
        }

        await pollWithDeadline(() => count1 >= 10 && count2 >= 10);

        if (count1 !== 10 || count2 !== 10) {
            throw new Error(`Expected 10/10 messages, got ${count1}/${count2}`);
        }
    });

});
