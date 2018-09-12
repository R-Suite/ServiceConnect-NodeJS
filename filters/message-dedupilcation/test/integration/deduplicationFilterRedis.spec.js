//@flow
import 'babel-polyfill';

import chai, { expect, assert } from 'chai'
import chaiAsPromised from "chai-as-promised"
import sinon from "sinon"

import _fs from "fs"

import Bus from "service-connect"
import { outgoingDeduplicationFilterRedis, incomingDeduplicationFilterRedis } from "../../src/filters/deduplicationFilterRedis"

chai.use(chaiAsPromised);

let sleep = (ms: number): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms));
}

describe('deduplicationFilterRedis', function (done) {

    const sandbox = sinon.createSandbox();
    const handlerSpy = sandbox.spy();

    const queueName = "DeduplicationFilter.TestQueue";
    const messageType = "CustomMessageType";

    const rabbitmqConfig = {
        queue: { name: queueName, maxPriority: 3 },
        host: "",
        ssl: {
            enabled: true,
            ca: "",
            key: "",
            cert: "",
            passphrase: ""
        }
    }

    const deduplicationFilterSettings = {
        redisSettings: {
            host: "127.0.0.0",
            port: 6379,
            dbIndex: 0
        },
        disableMsgExpiry: false,
        msgExpiryHours: 24
    }

    let bus = {};

    before(() => {
        bus = new Bus({
            amqpSettings: rabbitmqConfig,
            filters: {
                after: [
                    outgoingDeduplicationFilterRedis(deduplicationFilterSettings)
                ],
                before: [
                    incomingDeduplicationFilterRedis(deduplicationFilterSettings)
                ]
            }
        }).on("error", e => {
            console.error(e);
        });

        const createObjectCommandHandler = (bus: Object) =>
            async (message: Object, headers: Object, type: string): Promise<void> => {
                handlerSpy(headers.MessageId);
            }

        bus.init().then(() => bus.addHandler(messageType, createObjectCommandHandler(bus)));
    });

    after(() => {
        if (bus)
            bus.close();
        sandbox.restore();
    });

    it('should block message, if alredy received message with the same id', async () => {
        //create random messageId
        const mesId = "customMessageId" + new Date().getTime();

        await sleep(1000);

        bus.send(queueName, messageType,
            {}, {
                FullTypeName: messageType,
                MessageId: mesId
            });

        await sleep(1000);

        bus.send(queueName, messageType,
            {}, {
                FullTypeName: messageType,
                MessageId: mesId
            });

        await sleep(1000);

        bus.send(queueName, messageType,
            {}, {
                FullTypeName: messageType,
                MessageId: mesId
            });

        //give handlers some time to process messages    
        await sleep(2000);
        expect(handlerSpy.withArgs(mesId).calledOnce).to.be.true;
    });

    it('should allow messages with diffrent ids', async () => {
        //create random messageId
        const mesId = "customMessageId" + new Date().getTime();

        await sleep(1000);

        bus.send(queueName, messageType,
            {}, {
                FullTypeName: messageType,
                MessageId: mesId
            });

        await sleep(1000);

        bus.send(queueName, messageType,
            {}, {
                FullTypeName: messageType,
                MessageId: mesId
            });

        await sleep(1000);

        bus.send(queueName, messageType,
            {}, {
                FullTypeName: messageType,
                MessageId: mesId + "_02"
            });

        //give handlers some time to process messages    
        await sleep(2000);
        expect(handlerSpy.withArgs(mesId).calledOnce).to.be.true;
        expect(handlerSpy.withArgs(mesId + "_02").calledOnce).to.be.true;
    });
});


