import 'babel-polyfill'
import Client from '../src/Clients/rabbitMQ';
import chai from 'chai';
import sinon from 'sinon';
import amqp from 'amqplib/callback_api';
import settings from '../src/settings';
import os from 'os';

let expect = chai.expect;
let assert = chai.assert;

describe("RabbitMQ Client", function() {

    var fakeChannel = {
        assertQueue: () => {},
        assertExchange: () => {},
        bindQueue: () => {},
        consume: () => {},
        unbindQueue: () => {},
        publish: () => {},
        sendToQueue: () => {},
        deleteQueue: () => {},
        ack: () => {},
        close: () => {}
    };

    describe("connect", function(){

        it("should connect to the amqp client", function(){
            var stub = sinon.stub(amqp, 'connect');
            var client = new Client(settings, () =>{});
            client.connect();
            assert.isTrue(stub.called);

            amqp.connect.restore();
        });

        it("should call error callback if error occurs during connect", function(){

            var errorCb = sinon.stub();
            settings.events.error = errorCb;

            sinon.stub(amqp, 'connect', (host, options, cb) => {
                cb("Error");
            });

            var client = new Client(settings, () =>{});
            client.connect();
            assert.isTrue(errorCb.calledWith("Error"));

            amqp.connect.restore();
        });

        it("should create channel after connecting", function(){
            var fakeConnection = { createChannel: () => {} };
            var createChannelStub = sinon.stub(fakeConnection, "createChannel");

            sinon.stub(amqp, 'connect', (host, options, cb) => {
                cb(undefined, fakeConnection);
            });

            var client = new Client(settings, () =>{});
            client.connect();

            assert.isTrue(createChannelStub.called);
            expect(client.connection).to.equal(fakeConnection);

            amqp.connect.restore();
        });

        it("should call error callback if error occurs during create channel", function(){

            var errorCb = sinon.stub();
            settings.events.error = errorCb;

            var fakeConnection = { createChannel: (cb) => {
                cb("Error");
            }};

            sinon.stub(amqp, 'connect', (host, options, cb) => {
                cb(undefined, fakeConnection);
            });

            var client = new Client(settings, () =>{});
            client.connect();

            assert.isTrue(errorCb.calledWith("Error"));

            amqp.connect.restore();
        });

        it("should create queues after creating channel", function(){
            var fakeChannel = sinon.stub();

            var fakeConnection = { createChannel: (cb) => {
                cb(undefined,fakeChannel);
            }};

            sinon.stub(amqp, 'connect', (host, options, cb) => {
                cb(undefined, fakeConnection);
            });

            var _createQueueStub = sinon.stub(Client.prototype, "_createQueues");

            var client = new Client(settings, () =>{});
            client.connect();

            assert.isTrue(_createQueueStub.called);
            expect(client.channel).to.equal(fakeChannel);

            amqp.connect.restore();
            Client.prototype._createQueues.restore();
        });
    });

    describe("_createQueues", function(){

        it("should create the queues", function(){

            settings.amqpSettings.queue.name = "TestQueue";

            var stub = sinon.stub(fakeChannel, "assertQueue");

            var client = new Client(settings, () =>{});
            client.channel = fakeChannel;
            client._createQueues();

            assert.isTrue(stub.calledWith(
                settings.amqpSettings.queue.name,
                sinon.match({
                    durable: settings.amqpSettings.queue.durable,
                    exclusive: settings.amqpSettings.queue.exclusive,
                    autoDelete: settings.amqpSettings.queue.autoDelete
                })
            ));

            fakeChannel.assertQueue.restore();
        });

        it("should bind the queue to the message types defined in the handlers configuration", function(){

            settings.amqpSettings.queue.name = "TestQueue";
            settings.handlers = {
                "Log1.Message": [],
                "Log2.Message": []
            };

            var assertExchangeStub = sinon.stub(fakeChannel, "assertExchange");
            var bindQueueStub = sinon.stub(fakeChannel, "bindQueue");

            var client = new Client(settings, () =>{});
            client.channel = fakeChannel;
            client._createQueues();

            assert.isTrue(assertExchangeStub.calledWith(
                "Log1Message",
                "fanout",
                sinon.match({
                    durable: true
                })
            ));

            assert.isTrue(bindQueueStub.calledWith(
                settings.amqpSettings.queue.name,
                "Log1Message",
                ''
            ));

            assert.isTrue(assertExchangeStub.calledWith(
                "Log2Message",
                "fanout",
                sinon.match({
                    durable: true
                })
            ));

            assert.isTrue(bindQueueStub.calledWith(
                settings.amqpSettings.queue.name,
                "Log2Message",
                ''
            ));

            fakeChannel.assertExchange.restore();
            fakeChannel.bindQueue.restore();

        });

        it("should configure retries", function(){

            settings.amqpSettings.queue.name = "TestQueue";

            var assertQueueStub = sinon.stub(fakeChannel, "assertQueue");
            var assertExchangeStub = sinon.stub(fakeChannel, "assertExchange");
            var bindQueueStub = sinon.stub(fakeChannel, "bindQueue");

            var client = new Client(settings, () =>{});
            client.channel = fakeChannel;
            client._createQueues();

            assert.isTrue(assertExchangeStub.calledWith(
                settings.amqpSettings.queue.name + ".Retries.DeadLetter",
                "fanout",
                sinon.match({
                    durable: true
                })
            ));

            assert.isTrue(assertQueueStub.calledWith(
                settings.amqpSettings.queue.name + ".Retries",
                sinon.match({
                    durable: settings.amqpSettings.queue.durable,
                    arguments: {
                        "x-dead-letter-exchange": settings.amqpSettings.queue.name + ".Retries.DeadLetter",
                        "x-message-ttl": settings.amqpSettings.retryDelay
                    }
                })
            ));

            assert.isTrue(bindQueueStub.calledWith(
                settings.amqpSettings.queue.name,
                settings.amqpSettings.queue.name + ".Retries.DeadLetter",
                ''
            ));

            fakeChannel.assertQueue.restore();
            fakeChannel.assertExchange.restore();
            fakeChannel.bindQueue.restore();

        });

        it("should configure errors", function(){

            settings.amqpSettings.queue.name = "TestQueue";

            var assertQueueStub = sinon.stub(fakeChannel, "assertQueue");
            var assertExchangeStub = sinon.stub(fakeChannel, "assertExchange");

            var client = new Client(settings, () =>{});
            client.channel = fakeChannel;
            client._createQueues();

            assert.isTrue(assertExchangeStub.calledWith(
                settings.amqpSettings.errorQueue,
                "direct",
                sinon.match({
                    durable: true
                })
            ));

            assert.isTrue(assertQueueStub.calledWith(
                settings.amqpSettings.errorQueue,
                sinon.match({
                    durable: true,
                    autoDelete: false
                })
            ));
            fakeChannel.assertQueue.restore();
            fakeChannel.assertExchange.restore();

        });

        it("should configure auditing if enabled", function(){

            settings.amqpSettings.queue.name = "TestQueue";
            settings.amqpSettings.auditEnabled = true;

            var assertQueueStub = sinon.stub(fakeChannel, "assertQueue");
            var assertExchangeStub = sinon.stub(fakeChannel, "assertExchange");

            var client = new Client(settings, () =>{});
            client.channel = fakeChannel;
            client._createQueues();

            assert.isTrue(assertExchangeStub.calledWith(
                settings.amqpSettings.auditQueue,
                "direct",
                sinon.match({
                    durable: true
                })
            ));

            assert.isTrue(assertQueueStub.calledWith(
                settings.amqpSettings.auditQueue,
                sinon.match({
                    durable: true,
                    autoDelete: false
                })
            ));

            fakeChannel.assertQueue.restore();
            fakeChannel.assertExchange.restore();
        });

        it("should not configure auditing if disabled", function(){

            settings.amqpSettings.queue.name = "TestQueue";
            settings.amqpSettings.auditEnabled = false;

            var assertQueueStub = sinon.stub(fakeChannel, "assertQueue");
            var assertExchangeStub = sinon.stub(fakeChannel, "assertExchange");

            var client = new Client(settings, () =>{});
            client.channel = fakeChannel;
            client._createQueues();

            assert.isFalse(assertExchangeStub.calledWith(
                settings.amqpSettings.auditQueue,
                "direct",
                sinon.match({
                    durable: true
                })
            ));

            assert.isFalse(assertQueueStub.calledWith(
                settings.amqpSettings.auditQueue,
                sinon.match({
                    durable: true,
                    autoDelete: false
                })
            ));

            fakeChannel.assertQueue.restore();
            fakeChannel.assertExchange.restore();

        });

        it("should begin consuming messages", function(){

            settings.amqpSettings.queue.name = "TestQueue";
            settings.amqpSettings.auditEnabled = false;

            var consumeStub = sinon.stub(fakeChannel, "consume");

            var cb = () =>{};
            var client = new Client(settings, cb);
            client.channel = fakeChannel;
            client._createQueues();

            assert.isTrue(consumeStub.calledWith(
                settings.amqpSettings.queue.name,
                client._consumeMessage,
                sinon.match({
                    noAck: settings.amqpSettings.queue.noAck
                })
            ));

            fakeChannel.consume.restore();
        });

        it("should trigger the connected callback function defined in the configuration", function(){
            settings.amqpSettings.queue.name = "TestQueue";
            settings.amqpSettings.auditEnabled = false;
            var cb = sinon.stub();
            settings.events.connected = cb;

            var client = new Client(settings, () => {});
            client.channel = fakeChannel;
            client._createQueues();

            assert.isTrue(cb.called);
        });
    });

    describe("consumeType", function(){

        it("should create a exchange with the same name as the supplied type", function(){

            settings.amqpSettings.queue.name = "TestQueue";
            settings.amqpSettings.auditEnabled = false;

            var assertExchangeStub = sinon.stub(fakeChannel, "assertExchange");

            var client = new Client(settings, () =>{});
            client.channel = fakeChannel;

            client.consumeType("TestType123");

            assert.isTrue(assertExchangeStub.calledWith(
                "TestType123",
                "fanout",
                sinon.match({
                    durable: true
                })
            ));

            fakeChannel.assertExchange.restore();
        });

        it("should bind the queue to the new exchange", function(){

            settings.amqpSettings.queue.name = "TestQueue";
            settings.amqpSettings.auditEnabled = false;

            var bindQueueStub = sinon.stub(fakeChannel, "bindQueue");

            var client = new Client(settings, () =>{});
            client.channel = fakeChannel;

            client.consumeType("TestType123");

            assert.isTrue(bindQueueStub.calledWith(
                settings.amqpSettings.queue.name,
                "TestType123",
                ''
            ));

            fakeChannel.bindQueue.restore();
        });

    });

    describe("removeType", function(){

        it("should unbind the queue from the exchange with name equal to the supplied type name", function(){
            settings.amqpSettings.queue.name = "TestQueue";
            settings.amqpSettings.auditEnabled = false;

            var unbindQueueStub = sinon.stub(fakeChannel, "unbindQueue");

            var client = new Client(settings, () =>{});
            client.channel = fakeChannel;

            client.removeType("TestType123");

            assert.isTrue(unbindQueueStub.calledWith(
                settings.amqpSettings.queue.name,
                "TestType123"
            ));

            fakeChannel.unbindQueue.restore();
        });

    });

    describe("send", function(){

        it("should send a message to the supplied endpoint", function(){
            settings.amqpSettings.queue.name = "TestQueue";
            settings.amqpSettings.auditEnabled = false;

            var sendToQueueStub = sinon.stub(fakeChannel, "sendToQueue");

            var client = new Client(settings, () =>{});
            client.channel = fakeChannel;

            var message = {
                data: 123
            };

            client.send("TestEndpoint", "LogMessage", message, {});

            assert.isTrue(sendToQueueStub.calledWith(
                "TestEndpoint",
                sinon.match(v => {
                    return JSON.parse(v.toString()).data == message.data;
                }),
                sinon.match.any
            ));

            fakeChannel.sendToQueue.restore();
        });

        it("should send the correct message headings", function(){
            settings.amqpSettings.queue.name = "TestQueue";
            settings.amqpSettings.auditEnabled = false;

            var sendToQueueStub = sinon.stub(fakeChannel, "sendToQueue");

            var client = new Client(settings, () =>{});
            client.channel = fakeChannel;

            var message = {
                data: 123
            };

            client.send("TestEndpoint", "LogMessage", message, {
                customHeader: 123
            });

            assert.isTrue(sendToQueueStub.calledWith(
                "TestEndpoint",
                sinon.match.any,
                sinon.match({
                    headers: {
                        customHeader: 123,
                        DestinationAddress: "TestEndpoint",
                        MessageType: "Send",
                        SourceAddress: "TestQueue",
                        TypeName: "LogMessage",
                        ConsumerType: "RabbitMQ",
                        Language: "Javascript"
                    }
                })
            ));

            fakeChannel.sendToQueue.restore();
        });

        it("should send a message to the supplied endpoints if an array of endpoints is passed", function(){
            settings.amqpSettings.queue.name = "TestQueue";
            settings.amqpSettings.auditEnabled = false;

            var sendToQueueStub = sinon.stub(fakeChannel, "sendToQueue");

            var client = new Client(settings, () =>{});
            client.channel = fakeChannel;

            var message = {
                data: 123
            };

            client.send(["TestEndpoint1", "TestEndpoint2"], "LogMessage", message);

            assert.isTrue(sendToQueueStub.calledWith(
                "TestEndpoint1",
                sinon.match(v => {
                    return JSON.parse(v.toString()).data == message.data;
                }),
                sinon.match.any
            ));

            assert.isTrue(sendToQueueStub.calledWith(
                "TestEndpoint2",
                sinon.match(v => {
                    return JSON.parse(v.toString()).data == message.data;
                }),
                sinon.match.any
            ));

            fakeChannel.sendToQueue.restore();
        });

    });

    describe("publish", function(){

        it("should publish the message", function(){
            settings.amqpSettings.queue.name = "TestQueue";
            settings.amqpSettings.auditEnabled = false;

            var publishStub = sinon.stub(fakeChannel, "publish");

            var client = new Client(settings, () =>{});
            client.channel = fakeChannel;

            var message = {
                data: 123
            };

            client.publish("LogMessage", message);

            assert.isTrue(publishStub.calledWith(
                "LogMessage",
                '',
                sinon.match(v => {
                    return JSON.parse(v.toString()).data == message.data;
                }),
                sinon.match.any
            ));

            fakeChannel.publish.restore();
        });

        it("should publish the message with the correct headers", function(){
            settings.amqpSettings.queue.name = "TestQueue";
            settings.amqpSettings.auditEnabled = false;

            var publishStub = sinon.stub(fakeChannel, "publish");

            var client = new Client(settings, () =>{});
            client.channel = fakeChannel;

            var message = {
                data: 123
            };

            client.publish("LogMessage", message, {
                customHeader: 123
            });

            assert.isTrue(publishStub.calledWith(
                "LogMessage",
                '',
                sinon.match.any,
                sinon.match({
                    headers: {
                        customHeader: 123,
                        DestinationAddress: "TestQueue",
                        MessageType: "Publish",
                        SourceAddress: "TestQueue",
                        TypeName: "LogMessage",
                        ConsumerType: "RabbitMQ",
                        Language: "Javascript"
                    }
                })
            ));

            fakeChannel.publish.restore();
        });

        it("should assert that the exchange exists before publishing", function(){
            settings.amqpSettings.queue.name = "TestQueue";
            settings.amqpSettings.auditEnabled = false;

            var assertExchangeStub = sinon.stub(fakeChannel, "assertExchange");

            var client = new Client(settings, () =>{});
            client.channel = fakeChannel;

            var message = {
                data: 123
            };

            client.publish("LogMessage", message);

            assert.isTrue(assertExchangeStub.calledWith(
                "LogMessage",
                'fanout',
                sinon.match({
                    durable: true
                })
            ));

            fakeChannel.assertExchange.restore();
        });

    });

    describe("_consumeMessage", function(){

        var message;

        beforeEach(function(){
            message = {
                content: new Buffer(JSON.stringify({
                    data: 123
                }), "utf-8"),
                properties: {
                    headers: {
                        TypeName: "LogCommand"
                    },
                    messageId: 1
                }
            };
        });

        it("should set the correct headings", function(){
            settings.amqpSettings.queue.name = "TestQueue";

            var client = new Client(settings, () =>{} );
            client.channel = fakeChannel;
            client.consumeMessageCallback = sinon.stub().returns({ success: true });
            client._consumeMessage(message);

            expect(message.properties.headers.DestinationMachine).to.equal(os.hostname());
            expect(message.properties.headers.DestinationAddress).to.equal("TestQueue");

            expect(message.properties.headers.TimeProcessed).to.not.be.undefined;
            expect(message.properties.headers.TimeReceived).to.not.be.undefined;
        });

        it("should throw exception if the typename is not in the headers", function(){
            settings.amqpSettings.queue.name = "TestQueue";
            message.properties.headers.TypeName = undefined;

            var client = new Client(settings, () =>{});
            client.channel = fakeChannel;
            client.consumeMessageCallback = sinon.stub().returns({ success: true });

            var fn = () => {
                client._consumeMessage(message);
            };

            expect(fn).to.throw(sinon.match({
                error: "Message does not contain TypeName",
                message: message
            }));
        });

        it("should ack message if exception is thrown", function(){
            settings.amqpSettings.queue.name = "TestQueue";
            message.properties.headers.TypeName = undefined;

            var ackStub = sinon.stub(fakeChannel, "ack");

            var client = new Client(settings, () =>{});
            client.channel = fakeChannel;
            client.consumeMessageCallback = sinon.stub().returns({ success: true });

            try{
                client._consumeMessage(message);
            } catch(e) {}

            assert.isTrue(ackStub.calledWith(message));

            fakeChannel.ack.restore();
        });

        it("should call the consumeMessageCallback function", function(){
            settings.amqpSettings.queue.name = "TestQueue";

            var client = new Client(settings, () =>{});
            client.channel = fakeChannel;
            client.consumeMessageCallback = sinon.stub().returns({ success: true });

            client._consumeMessage(message);

            assert.isTrue(client.consumeMessageCallback.calledWith(
                sinon.match(JSON.parse(message.content.toString())),
                sinon.match(message.properties.headers),
                sinon.match(message.properties.headers.TypeName)));
        });

        it("if successful and auditing is enabled should send message to audit queue", function(){
            settings.amqpSettings.queue.name = "TestQueue";
            settings.amqpSettings.auditEnabled = true;

            var sendToQueueStub = sinon.stub(fakeChannel, "sendToQueue");

            var client = new Client(settings, () =>{});
            client.channel = fakeChannel;
            client.consumeMessageCallback = sinon.stub().returns({ success: true });

            client._consumeMessage(message);

            assert.isTrue(sendToQueueStub.calledWith(
                settings.amqpSettings.auditQueue,
                message.content,
                sinon.match({
                    headers: message.properties.headers,
                    messageId: message.properties.messageId
                })
            ));

            fakeChannel.sendToQueue.restore();
        });

        it("if successful and auditing is disabled should not send message to audit queue", function(){
            settings.amqpSettings.queue.name = "TestQueue";
            settings.amqpSettings.auditEnabled = false;

            var sendToQueueStub = sinon.stub(fakeChannel, "sendToQueue");

            var client = new Client(settings, () =>{});
            client.channel = fakeChannel;
            client.consumeMessageCallback = sinon.stub().returns({ success: true });

            client._consumeMessage(message);

            assert.isFalse(sendToQueueStub.called);

            fakeChannel.sendToQueue.restore();
        });

        it("if consumeMessageCallback is not successful should send message to retry queue with retry count set to 1", function(){
            settings.amqpSettings.queue.name = "TestQueue";
            settings.amqpSettings.auditEnabled = false;

            var sendToQueueStub = sinon.stub(fakeChannel, "sendToQueue");

            var client = new Client(settings, () =>{});
            client.channel = fakeChannel;
            client.consumeMessageCallback = sinon.stub().returns({ success: false, exception: "Error" });

            client._consumeMessage(message);

            assert.isTrue(sendToQueueStub.calledWith(
                "TestQueue.Retries",
                message.content,
                sinon.match({
                    headers: message.properties.headers,
                    messageId: message.properties.messageId
                })
            ));

            expect(message.properties.headers.RetryCount).to.equal(1);

            fakeChannel.sendToQueue.restore();
        });

        it("if result is not successful and headers already contain RetryCount should increment RetryCount " +
            "and assign to headers", function(){
            settings.amqpSettings.queue.name = "TestQueue";
            settings.amqpSettings.auditEnabled = false;
            message.properties.headers.RetryCount = 1;

            var sendToQueueStub = sinon.stub(fakeChannel, "sendToQueue");

            var client = new Client(settings, () =>{});
            client.channel = fakeChannel;
            client.consumeMessageCallback = sinon.stub().returns({ success: false, exception: "Error" });

            client._consumeMessage(message);

            assert.isTrue(sendToQueueStub.calledWith(
                "TestQueue.Retries",
                message.content,
                sinon.match({
                    headers: message.properties.headers,
                    messageId: message.properties.messageId
                })
            ));

            expect(message.properties.headers.RetryCount).to.equal(2);

            fakeChannel.sendToQueue.restore();
        });

        it("if consumeMessageCallback is not successful and retry count has reached max should send message " +
            "to error queue", function(){
            settings.amqpSettings.queue.name = "TestQueue";
            settings.amqpSettings.auditEnabled = false;
            message.properties.headers.RetryCount = 3;

            var sendToQueueStub = sinon.stub(fakeChannel, "sendToQueue");

            var client = new Client(settings, () =>{});
            client.channel = fakeChannel;
            client.consumeMessageCallback = sinon.stub().returns({ success: false, exception: "Error" });

            client._consumeMessage(message);

            assert.isTrue(sendToQueueStub.calledWith(
                settings.amqpSettings.errorQueue,
                message.content,
                sinon.match({
                    headers: message.properties.headers,
                    messageId: message.properties.messageId
                })
            ));

            fakeChannel.sendToQueue.restore();
        });

        it("if consumeMessageCallback is not successful and retry count has reached max should add Exception " +
            "to headers", function(){
            settings.amqpSettings.queue.name = "TestQueue";
            settings.amqpSettings.auditEnabled = false;
            message.properties.headers.RetryCount = 3;

            var sendToQueueStub = sinon.stub(fakeChannel, "sendToQueue");

            var client = new Client(settings, () =>{});
            client.channel = fakeChannel;
            client.consumeMessageCallback = sinon.stub().returns({ success: false, exception: "Error" });

            client._consumeMessage(message);

            assert.isTrue(sendToQueueStub.calledWith(
                settings.amqpSettings.errorQueue,
                message.content,
                sinon.match({
                    headers: message.properties.headers,
                    messageId: message.properties.messageId
                })
            ));

            expect(message.properties.headers.Exception).to.equal("Error");

            fakeChannel.sendToQueue.restore();
        });

        it("if consumeMessageCallback throws exception should send message to retry queue", function(){
            settings.amqpSettings.queue.name = "TestQueue";
            settings.amqpSettings.auditEnabled = false;

            var sendToQueueStub = sinon.stub(fakeChannel, "sendToQueue");

            var client = new Client(settings, () =>{});
            client.channel = fakeChannel;
            client.consumeMessageCallback = sinon.stub().throws("Error");

            client._consumeMessage(message);

            assert.isTrue(sendToQueueStub.calledWith(
                settings.amqpSettings.queue.name + ".Retries",
                message.content,
                sinon.match({
                    headers: message.properties.headers,
                    messageId: message.properties.messageId
                })
            ));

            expect(message.properties.headers.RetryCount).to.equal(1);

            fakeChannel.sendToQueue.restore();
        });

        it("if consumeMessageCallback throws exception and retry count has reached max should send message " +
            "to error queue", function(){
            settings.amqpSettings.queue.name = "TestQueue";
            settings.amqpSettings.auditEnabled = false;
            message.properties.headers.RetryCount = 3;

            var sendToQueueStub = sinon.stub(fakeChannel, "sendToQueue");

            var client = new Client(settings, () =>{});
            client.channel = fakeChannel;
            var error = { error: "Error"};
            client.consumeMessageCallback = sinon.stub().throws(error);

            client._consumeMessage(message);

            assert.isTrue(sendToQueueStub.calledWith(
                settings.amqpSettings.errorQueue,
                message.content,
                sinon.match({
                    headers: message.properties.headers,
                    messageId: message.properties.messageId
                })
            ));

            expect(message.properties.headers.Exception).to.equal(error);

            fakeChannel.sendToQueue.restore();
        });

        it("if noAck is true then should not ack the message", function(){
            settings.amqpSettings.queue.name = "TestQueue";
            settings.amqpSettings.queue.noAck = true;
            settings.amqpSettings.auditEnabled = false;

            var ackStub = sinon.stub(fakeChannel, "ack");

            var client = new Client(settings, () =>{});
            client.channel = fakeChannel;
            client.consumeMessageCallback = sinon.stub().returns({ success: true });

            client._consumeMessage(message);

            assert.isFalse(ackStub.called);

            fakeChannel.ack.restore();
        });

        it("should ack after processing the message if noAck is false", function(){
            settings.amqpSettings.queue.name = "TestQueue";
            settings.amqpSettings.queue.noAck = false;
            settings.amqpSettings.auditEnabled = false;

            var ackStub = sinon.stub(fakeChannel, "ack");

            var client = new Client(settings, () =>{});
            client.channel = fakeChannel;
            client.consumeMessageCallback = sinon.stub().returns({ success: true });

            client._consumeMessage(message);

            assert.isTrue(ackStub.called);

            fakeChannel.ack.restore();
        });
    });

    describe("close", function(){

        it("should close the channel", function(){
            var closeStub = sinon.stub(fakeChannel, "close");

            var client = new Client(settings, () =>{});
            client.channel = fakeChannel;

            client.close();

            assert.isTrue(closeStub.called);

            fakeChannel.close.restore();
        });

        it("should delete the retry queue if autoDelete is enabled", function(){
            settings.amqpSettings.queue.name = "TestQueue";
            settings.amqpSettings.queue.autoDelete = true;

            var deleteQueueStub = sinon.stub(fakeChannel, "deleteQueue");

            var client = new Client(settings, () =>{});
            client.channel = fakeChannel;

            client.close();

            assert.isTrue(deleteQueueStub.calledWith(settings.amqpSettings.queue.name + ".Retries"));

            fakeChannel.deleteQueue.restore();
        });
    });
});