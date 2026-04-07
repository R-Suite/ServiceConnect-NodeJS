
import { Bus } from '../src/index';
import amqplib from 'amqplib';
import config from "./config"

describe("Audit Queue", () => {

    let consumer : Bus, producer : Bus;

    afterEach(async () => {
        await consumer?.close();
        await producer?.close();
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

        let received = false;

        const messageHandler = async (message : {[k:string]: any}) => {
            received = true;
        };

        await consumer.addHandler("TestMessageType", messageHandler);

        await producer.send("Test.Consumer", "TestMessageType", { CorrelationId: "audit-test-123" });

        // Wait for handler to process and audit message to be forwarded
        await new Promise(resolve => setTimeout(resolve, 500));

        if (!received) {
            throw new Error("Handler was not called");
        }

        // Verify audit queue received the message using a direct amqplib connection
        const conn = await amqplib.connect(config.host);
        const ch = await conn.createChannel();
        try {
            const msg = await ch.get("Test.Consumer.Audit", { noAck: true });
            if (!msg) {
                throw new Error("Audit queue is empty — no message was forwarded after successful processing");
            }

            const body = JSON.parse(msg.content.toString());
            if (body.CorrelationId !== "audit-test-123") {
                throw new Error(`Expected CorrelationId 'audit-test-123' in audit message, got '${body.CorrelationId}'`);
            }

            const headers = msg.properties.headers;
            if (!headers.TimeProcessed) {
                throw new Error("Audit message is missing TimeProcessed header");
            }
            if (!headers.TypeName || headers.TypeName !== "TestMessageType") {
                throw new Error(`Expected TypeName 'TestMessageType' in audit headers, got '${headers.TypeName}'`);
            }
        } finally {
            await ch.close();
            await conn.close();
        }
    });
});
