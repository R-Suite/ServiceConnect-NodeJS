
import { Bus } from '../src/index';
import config from "./config"

describe("Priority Queue", () => {

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
                    name: "Test.Consumer.PriorityQueue",
                    maxPriority: 3
                },
                prefetch: 1
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

        // Setup and teardown so that message type is mapped to queue
        await consumer.init();
        await consumer.addHandler("TestMessageType", (m:any) => {});
        await consumer.close();
        
        await producer.init();

        // Add messages onto queue
        for (let i = 0; i < 2; i++) {
            await producer.send("Test.Consumer.PriorityQueue", "TestMessageType", {
                CorrelationId: "123",
                number: i
            }, { "Priority": i + 1});         
        }       
       
        return new Promise<void>(async (resolve, reject) => {
            let first : number | null = null, count : number = 0;

             // Init new consumer.  The high priority message should get processed first.
            consumer = new Bus({
                amqpSettings: {
                    host: config.host,
                    queue: {
                        name: "Test.Consumer.PriorityQueue",
                        maxPriority: 3
                    },
                    prefetch: 1
                },
                handlers: {
                    "TestMessageType": [(message : {[k:string]: any}, headers?: {[k:string]: unknown}) => {
                        if (first == null) {
                            first = message.number;
                        }
                        count++;
                        if (count == 2) {
                            // First processed message should be second published message
                            if (first === 1) {
                                resolve();
                            } else {
                                reject();
                            }
                        }
                    }]
                }
            });
            
            await consumer.init();
        });     

    });

});

const sleep = async (milliseconds : number) => {
    return new Promise<void> ((resolve, _) => {
        setTimeout(() => resolve(), milliseconds);
    })
}