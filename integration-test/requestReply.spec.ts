
import { Bus } from '../src/index';
import { Message, MessageHandler } from '../src/types';
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

describe("Request Reply", () => {

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

        const messageHandler : MessageHandler<Message> = async (message : {[k:string]: any}, headers?: {[k: string]: unknown;}, type?: string, replyCallback?: (type: string, message: any) => void) => {
            if (replyCallback) {
                replyCallback("Reply", { CorrelationId: message.CorrelationId, number: message.number });
            }
        };

        await consumer.addHandler("TestMessageType", messageHandler);

        const replyHandler : MessageHandler<Message> = async (message : {[k:string]: any}, headers?: {[k: string]: unknown;}, type?: string, replyCallback?: (type: string, message: any) => void) => {
            count++;
        };

        for (let i = 0; i < 10; i++) {
            await producer.sendRequest("Test.Consumer", "TestMessageType", {
                CorrelationId: "123", number: i
             }, replyHandler);
        }

        // Wait for all replies
        await pollWithDeadline(() => count >= 10);
    });

});
