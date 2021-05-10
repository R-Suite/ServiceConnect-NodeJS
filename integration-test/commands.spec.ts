
import { Bus } from '../src/index';
import config from "./config"

describe("Commands", () => {

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

            const messageHandler = async (message : {[k:string]: any}) => {
                count++;
                if (count === 10) {
                    resolve();
                }
            };
    
            await consumer.addHandler("TestMessageType", messageHandler);

            for (let i = 0; i < 10; i++) {
                producer.send("Test.Consumer", "TestMessageType", {
                    CorrelationId: "123",
                    number: i
                });         
            }
        });     

    });

});