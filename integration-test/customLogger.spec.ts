
import { expect } from 'chai';
import { Bus } from '../src/index';
import config from "./config"

describe("Custom logger", () => {

    let consumer : Bus, producer : Bus;

    afterEach(async () => {
        await consumer.close();
        await producer.close();
    })

    it("should send and receive all events", async () => {
        const errors : any = [];
        const infos : any = [];

        const logger = {
            error: (msg :string, e?: unknown) => errors.push(msg),
            info: (msg :string) => infos.push(msg),
        };

        consumer = new Bus({
            amqpSettings: {
                host: config.host,
                queue: {
                    name: "Test.Consumer",
                    autoDelete: true
                }
            },
            logger
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
                throw new Error("Error in handler");
            };
    
            await consumer.addHandler("TestMessageType", messageHandler);

            await producer.send("Test.Consumer", "TestMessageType", {
                CorrelationId: "123"
            });

            setTimeout(() => {
                expect(errors.length).to.equal(1);
                expect(infos.length > 0).to.be.true;
                resolve();
            }, 200);
        });     

    });

});