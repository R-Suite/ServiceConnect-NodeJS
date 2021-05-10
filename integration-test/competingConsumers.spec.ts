
import { Bus } from '../src/index';
import config from "./config"

describe("Competing consumers", () => {

    let consumer1 : Bus, consumer2 : Bus, producer : Bus;

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
                    name: "Test.Consumer",
                    autoDelete: true
                }
            }
        });
        consumer2 = new Bus({
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

        await consumer1.init();
        await consumer2.init();
        await producer.init();
       
        return new Promise<void>(async (resolve, reject) => {
            let count1 = 0, count2 = 0, total = 0;

            const messageHandler1 = async (message : {[k:string]: any}) => {
                total++;  
                count1++;              
                if (total === 10) { 
                    if (count1 === 5 && count2 === 5) {
                        resolve();
                    } else {
                        reject();
                    }
                }  
            };
            const messageHandler2 = async (message : {[k:string]: any}) => {
                total++;    
                count2++;             
                if (total === 10) { 
                    if (count1 === 5 && count2 === 5) {
                        resolve();
                    } else {
                        reject();
                    }
                }           
            };
    
            await consumer1.addHandler("TestMessageType", messageHandler1);
            await consumer2.addHandler("TestMessageType", messageHandler2);

            for (let i = 0; i < 10; i++) {
                producer.send("Test.Consumer", "TestMessageType", {
                    CorrelationId: "123",
                    number: i
                });         
            }
        });     

    });

});