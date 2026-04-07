
import { expect } from 'chai';
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

describe("Scatter Gather", () => {

    let consumer1 : Bus, consumer2 : Bus,producer : Bus;

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

        let count = 0;

        const messageHandler1 : MessageHandler<Message> = async (message : {[k:string]: any}, headers?: {[k: string]: unknown;}, type?: string, replyCallback?: (type: string, message: any) => void) => {
            if (replyCallback) {
                replyCallback("Reply", { CorrelationId: message.CorrelationId, number: message.number });
            }
        };
        const messageHandler2 : MessageHandler<Message> = async (message : {[k:string]: any}, headers?: {[k: string]: unknown;}, type?: string, replyCallback?: (type: string, message: any) => void) => {
            if (replyCallback) {
                replyCallback("Reply", { CorrelationId: message.CorrelationId, number: message.number });
            }
        };

        await consumer1.addHandler("TestMessageType", messageHandler1);
        await consumer2.addHandler("TestMessageType", messageHandler2);

        const replyCallback : MessageHandler<Message> = async (message : {[k:string]: any}, headers?: {[k: string]: unknown;}, type?: string, replyCallback?: (type: string, message: any) => void) => {
            count++;
        };

        for (let i = 0; i < 10; i++) {
            await producer.publishRequest("TestMessageType", {
                CorrelationId: "123", number: i
            }, replyCallback, 2);
        }

        // Wait for all replies
        await pollWithDeadline(() => count >= 20);
    });

    it("should timeout after 100ms", async () => {
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

        let responseCount = 0, consumeCount = 0;

        const messageHandler1 : MessageHandler<Message> = async (message : {[k:string]: any}, headers?: {[k: string]: unknown;}, type?: string, replyCallback?: (type: string, message: any) => void) => {
            consumeCount++;
            if (message.number === 0) {
                if (replyCallback) {
                    replyCallback("Reply", { CorrelationId: message.CorrelationId, number: message.number });
                }
            } else {
                setTimeout(() => {
                    if (replyCallback) {
                        replyCallback("Reply", { CorrelationId: message.CorrelationId, number: message.number });
                    }
                }, 300);
            }
        };
        const messageHandler2 : MessageHandler<Message> = async (message : {[k:string]: any}, headers?: {[k: string]: unknown;}, type?: string, replyCallback?: (type: string, message: any) => void) => {
            consumeCount++;
            if (message.number === 0) {
                if (replyCallback) {
                    replyCallback("Reply", { CorrelationId: message.CorrelationId, number: message.number });
                }
            } else {
                setTimeout(() => {
                    if (replyCallback) {
                        replyCallback("Reply", { CorrelationId: message.CorrelationId, number: message.number });
                    }
                }, 300);
            }
        };

        await consumer1.addHandler("TestMessageType", messageHandler1);
        await consumer2.addHandler("TestMessageType", messageHandler2);

        const replyHandler : MessageHandler<Message> = async (message : {[k:string]: any}, headers?: {[k: string]: unknown;}, type?: string, replyCallback?: (type: string, message: any) => void) => {
            if (!headers?.timedOut) {
                responseCount++;
            }
        };

        for (let i = 0; i < 10; i++) {
            await producer.publishRequest("TestMessageType", {
                CorrelationId: "123", number: i
            }, replyHandler, 2, 200);
        }

        await new Promise<void>((resolve) => setTimeout(resolve, 500));

        expect(responseCount).to.equal(2);
        expect(consumeCount).to.equal(20);
    });

});
