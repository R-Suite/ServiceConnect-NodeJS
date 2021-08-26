
import { expect } from 'chai';
import { Bus } from '../src/index';
import { Message, MessageHandler } from '../src/types';
import config from "./config"

describe("Scatter Gather", () => {

    let consumer1 : Bus, consumer2 : Bus,producer : Bus;

    afterEach(async () => {
        await consumer1.close();
        await consumer2.close();
        await producer.close();
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
       
        return new Promise<void>(async (resolve, reject) => {
            let count = 0;

            const messageHandler1 : MessageHandler<Message> = async (message : {[k:string]: any}, headers?: {[k: string]: unknown;}, type?: string, replyCallback?: (type: string, message: any) => void) => {
                if (replyCallback) {
                    replyCallback("Reply", { number: message.number });
                }
            };
            const messageHandler2 : MessageHandler<Message> = async (message : {[k:string]: any}, headers?: {[k: string]: unknown;}, type?: string, replyCallback?: (type: string, message: any) => void) => {
                if (replyCallback) {
                    replyCallback("Reply", { number: message.number });
                }
            };
    
            await consumer1.addHandler("TestMessageType", messageHandler1);
            await consumer2.addHandler("TestMessageType", messageHandler2);

            const replyCallback : MessageHandler<Message> = async (message : {[k:string]: any}, headers?: {[k: string]: unknown;}, type?: string, replyCallback?: (type: string, message: any) => void) => {
                count++;
                if (count === 20) {
                    resolve();
                }
            };

            for (let i = 0; i < 10; i++) {
                producer.publishRequest("TestMessageType", {
                    CorrelationId: "123", number: i 
                }, replyCallback, 2);         
            }
        });     

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
       
        return new Promise<void>(async (resolve, reject) => {
            let responseCount = 0, consumeCount = 0;

            const messageHandler1 : MessageHandler<Message> = async (message : {[k:string]: any}, headers?: {[k: string]: unknown;}, type?: string, replyCallback?: (type: string, message: any) => void) => {
                consumeCount++;
                if (message.number === 0) {                
                    if (replyCallback) {
                        replyCallback("Reply", { number: message.number });
                    }
                } else {
                    setTimeout(() => {
                        if (replyCallback) {
                            replyCallback("Reply", { number: message.number });
                        }
                    }, 300);
                }
            };
            const messageHandler2 : MessageHandler<Message> = async (message : {[k:string]: any}, headers?: {[k: string]: unknown;}, type?: string, replyCallback?: (type: string, message: any) => void) => {
                consumeCount++;
                if (message.number === 0) {
                    if (replyCallback) {
                        replyCallback("Reply", { number: message.number });
                    }
                } else {
                    setTimeout(() => {
                        if (replyCallback) {
                            replyCallback("Reply", { number: message.number });
                        }
                    }, 300);
                }               
            };

            await consumer1.addHandler("TestMessageType", messageHandler1);
            await consumer2.addHandler("TestMessageType", messageHandler2);

            const replyCallback : MessageHandler<Message> = async (message : {[k:string]: any}, headers?: {[k: string]: unknown;}, type?: string, replyCallback?: (type: string, message: any) => void) => {
                responseCount++;                
            };

            for (let i = 0; i < 10; i++) {
                await producer.publishRequest("TestMessageType", {
                    CorrelationId: "123", number: i 
                }, replyCallback, 2, 200);         
            }
            setTimeout(() => {
                expect(responseCount).to.equal(2);
                expect(consumeCount).to.equal(20); 
                resolve();
            }, 500);
        });     

    });

});