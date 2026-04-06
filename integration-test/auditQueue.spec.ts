
import { Bus } from '../src/index';
import config from "./config"

describe("Audit Queue", () => {

    let consumer : Bus, producer : Bus;

    afterEach(async () => {
        await consumer.close();
        await producer.close();
    })

    it("should send successfully processed messages to audit queue", async () => {
        consumer = new Bus({
            amqpSettings: {
                host: config.host,
                queue: {
                    name: "Test.Consumer",
                    autoDelete: true
                },
                auditEnabled: true,
                auditQueue: "Test.Consumer.Audit"
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
            const messageHandler = async (message : {[k:string]: any}) => {
                resolve();
            };
    
            await consumer.addHandler("TestMessageType", messageHandler);

            await producer.send("Test.Consumer", "TestMessageType", { CorrelationId: "123" });
        });     
    });
});
