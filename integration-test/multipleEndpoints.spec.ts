
import { Bus } from '../src/index';
import config from "./config"

describe("Multiple Endpoints", () => {

    let consumer1 : Bus, consumer2 : Bus, producer : Bus;

    afterEach(async () => {
        await consumer1.close();
        await consumer2.close();
        await producer.close();
    })

    it("should send message to multiple endpoints", async () => {
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
            let count1 = 0, count2 = 0;

            const handler1 = async (message : {[k:string]: any}) => {
                count1++;
                if (count1 === 1 && count2 === 1) {
                    resolve();
                }
            };

            const handler2 = async (message : {[k:string]: any}) => {
                count2++;
                if (count1 === 1 && count2 === 1) {
                    resolve();
                }
            };
    
            await consumer1.addHandler("TestMessageType", handler1);
            await consumer2.addHandler("TestMessageType", handler2);

            await producer.send(
                ["Test.Consumer1", "Test.Consumer2"], 
                "TestMessageType", 
                { CorrelationId: "1" }
            );
        });     
    });
});

describe("Connection Status", () => {

    let consumer : Bus;

    afterEach(async () => {
        await consumer.close();
    })

    it("should report connected status correctly", async () => {
        consumer = new Bus({
            amqpSettings: {
                host: config.host,
                queue: {
                    name: "Test.Consumer",
                    autoDelete: true
                }
            }
        });

        await consumer.init();
       
        const connected = await consumer.isConnected();
        if (connected) {
            return Promise.resolve();
        } else {
            return Promise.reject(new Error("Expected to be connected"));
        }
    });
});
