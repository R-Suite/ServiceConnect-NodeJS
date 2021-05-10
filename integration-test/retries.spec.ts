
import { Bus } from '../src/index';
import config from "./config"

describe("Retries", () => {

    let consumer : Bus, producer : Bus;

    afterEach(async () => {
        await consumer.close();
        await producer.close();
    })

    it("should retry message 3 times if exception is thrown", async () => {
        consumer = new Bus({
            amqpSettings: {
                host: config.host,
                queue: {
                    name: "Test.Consumer",
                    autoDelete: true
                },
                maxRetries: 3,
                retryDelay: 50
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

            const messageHandler = async (message : {[k:string]: any}) => {
                count++;
                if (count === 4) {
                    resolve();
                } else {
                    throw new Error("Retry test")
                }
            };
    
            await consumer.addHandler("TestMessageType", messageHandler);

            producer.send("Test.Consumer", "TestMessageType", {
                CorrelationId: "123"
            }); 
        });     

    });

});