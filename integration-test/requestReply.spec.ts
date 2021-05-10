
import { Bus } from '../src/index';
import { MessageHandler } from '../src/types';
import config from "./config"

describe("Request Reply", () => {

    let consumer : Bus, producer : Bus;

    afterEach(async () => {
        await consumer.close();
        await producer.close();
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
       
        return new Promise<void>(async (resolve, reject) => {
            let count = 0;

            const messageHandler : MessageHandler = async (message : {[k:string]: any}, headers?: {[k: string]: unknown;}, type?: string, replyCallback?: (type: string, message: any) => void) => {
                if (replyCallback) {
                    replyCallback("Reply", { number: message.number });
                }
            };
    
            await consumer.addHandler("TestMessageType", messageHandler);

            const replyCallback : MessageHandler = async (message : {[k:string]: any}, headers?: {[k: string]: unknown;}, type?: string, replyCallback?: (type: string, message: any) => void) => {
                count++;
                if (count === 10) {
                    resolve();
                }
            };

            for (let i = 0; i < 10; i++) {
                producer.sendRequest("Test.Consumer", "TestMessageType", {
                    CorrelationId: "123", number: i
                 }, replyCallback);         
            }
        });     

    });

});