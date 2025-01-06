
import Client from '../src/clients/rabbitMQ';
import chai from 'chai';
import sinon from 'sinon';
import amqp from 'amqp-connection-manager';
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
        close: () => {},
        _channel: {
            cancel: () => {},
            deleteQueue: () => {},
            consumers: {},
            close: () => {}
        },
        consumers: []
    };

    describe("connect", function(){

        it("should connect to the amqp client", function(){
            var connection : any = { createChannel: sinon.stub(), on: sinon.stub() };
            var stub = sinon.stub(amqp, 'connect');
            sinon.stub(amqp as any, "on")
            stub.returns(connection)

            var client = new Client(settings() as any, async () =>{});
            client.connect();
            assert.isTrue(stub.called);

            (amqp.connect as any).restore();
        });

        it("should create channel after connecting", function(){
            var connection : any = { createChannel: sinon.stub(), on: sinon.stub() };
            var stub = sinon.stub(amqp, 'connect');
            stub.returns(connection)

            var client = new Client(settings() as any, async () =>{});
            client.connect();

            assert.isTrue(connection.createChannel.called);
            expect(client.connection).to.equal(connection);

            (amqp.connect as any).restore();
        });

    });

    describe("_createQueues", function(){
        var assertQueueStub : any, assertExchangeStub: any, bindQueueStub : any, consumeStub : any;
        
        beforeEach(() => {
            assertQueueStub = sinon.stub(fakeChannel, "assertQueue");
            assertExchangeStub = sinon.stub(fakeChannel, "assertExchange");
            bindQueueStub = sinon.stub(fakeChannel, "bindQueue");            
            consumeStub = sinon.stub(fakeChannel, "consume");
        });

        afterEach(() => {
            (fakeChannel as any).assertQueue.restore();
            (fakeChannel as any).assertExchange.restore();
            (fakeChannel as any).bindQueue.restore();
            (fakeChannel as any).consume.restore();
            
        })

        it("should create the queues", function(){
            var settingsObject : any = settings();
            settingsObject.amqpSettings.queue.name = "TestQueue";

            var client = new Client(settingsObject as any, async () =>{});
            client._createQueues(fakeChannel as any);

            expect(assertQueueStub.getCall(0).args[0]).to.equal(settingsObject.amqpSettings.queue.name);
            expect(assertQueueStub.getCall(0).args[1]).to.deep.equal({
                durable: settingsObject.amqpSettings.queue.durable,
                exclusive: settingsObject.amqpSettings.queue.exclusive,
                autoDelete: settingsObject.amqpSettings.queue.autoDelete,
                arguments: undefined
            });
            
        });

        it("should bind the queue to the message types defined in the handlers configuration", async function(){
            var settingsObject : any = settings();
            settingsObject.amqpSettings.queue.name = "TestQueue";
            settingsObject.handlers = {
                "Log1.Message": [],
                "Log2.Message": []
            };

            var client = new Client(settingsObject as any, async () =>{});
            client.channel = fakeChannel as any;
            await client._createQueues(fakeChannel as any);

            assert.isTrue(assertExchangeStub.calledWith(
                "Log1Message",
                "fanout",
                sinon.match({
                    durable: true
                })
            ));

            assert.isTrue(bindQueueStub.calledWith(
                settingsObject.amqpSettings.queue.name,
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
                settingsObject.amqpSettings.queue.name,
                "Log2Message",
                ''
            ));

        });

        it("should configure retries", async function(){
            var settingsObject : any = settings();
            settingsObject.amqpSettings.queue.name = "TestQueue";


            var client = new Client(settingsObject as any, async () =>{});
            client.channel = fakeChannel as any;
            await client._createQueues(fakeChannel as any);

            assert.isTrue(assertExchangeStub.calledWith(
                settingsObject.amqpSettings.queue.name + ".Retries.DeadLetter",
                "direct",
                sinon.match({
                    durable: true
                })
            ));

            assert.isTrue(assertQueueStub.calledWith(
                settingsObject.amqpSettings.queue.name + ".Retries",
                sinon.match({
                    durable: settingsObject.amqpSettings.queue.durable,
                    arguments: {
                        "x-dead-letter-exchange": settingsObject.amqpSettings.queue.name + ".Retries.DeadLetter",
                        "x-message-ttl": settingsObject.amqpSettings.retryDelay
                    }
                })
            ));

            assert.isTrue(bindQueueStub.calledWith(
                settingsObject.amqpSettings.queue.name,
                settingsObject.amqpSettings.queue.name + ".Retries.DeadLetter",
                settingsObject.amqpSettings.queue.name + ".Retries",
            ));
        });

        it("should configure errors", async function(){

            var settingsObject : any = settings();
            settingsObject.amqpSettings.queue.name = "TestQueue";

            var client = new Client(settingsObject as any, async () =>{});
            client.channel = fakeChannel as any;
            await client._createQueues(fakeChannel as any);

            assert.isTrue(assertExchangeStub.calledWith(
                settingsObject.amqpSettings.errorQueue,
                "direct",
                sinon.match({
                    durable: false
                })
            ));

            assert.isTrue(assertQueueStub.calledWith(
                settingsObject.amqpSettings.errorQueue,
                sinon.match({
                    durable: true,
                    autoDelete: false
                })
            ));

        });

        it("should configure auditing if enabled", async function(){

            var settingsObject : any = settings();
            settingsObject.amqpSettings.queue.name = "TestQueue";
            settingsObject.amqpSettings.auditEnabled = true;

            var client = new Client(settingsObject as any, async () =>{});
            client.channel = fakeChannel as any;
            await client._createQueues(fakeChannel as any);

            assert.isTrue(assertExchangeStub.calledWith(
                settingsObject.amqpSettings.auditQueue,
                "direct",
                sinon.match({
                    durable: false
                })
            ));

            assert.isTrue(assertQueueStub.calledWith(
                settingsObject.amqpSettings.auditQueue,
                sinon.match({
                    durable: true,
                    autoDelete: false
                })
            ));
        });

        it("should not configure auditing if disabled", async function(){
            var settingsObject : any = settings();
            settingsObject.amqpSettings.queue.name = "TestQueue";
            settingsObject.amqpSettings.auditEnabled = false;

            var client = new Client(settingsObject as any, async () =>{});
            client.channel = fakeChannel as any;
            await client._createQueues(fakeChannel as any);

            assert.isFalse(assertExchangeStub.calledWith(
                settingsObject.amqpSettings.auditQueue,
                "direct",
                sinon.match({
                    durable: false
                })
            ));

            assert.isFalse(assertQueueStub.calledWith(
                settingsObject.amqpSettings.auditQueue,
                sinon.match({
                    durable: true,
                    autoDelete: false
                })
            ));

        });

        it("should begin consuming messages", async function(){
            var settingsObject : any = settings();
            settingsObject.amqpSettings.queue.name = "TestQueue";
            settingsObject.amqpSettings.auditEnabled = false;


            var cb = async () =>{};
            var client = new Client(settingsObject, cb);
            client.channel = fakeChannel as any;
            await client._createQueues(fakeChannel as any);

            assert.isTrue(consumeStub.calledWith(
                settingsObject.amqpSettings.queue.name,
                client._consumeMessage,
                sinon.match({
                    noAck: settingsObject.amqpSettings.queue.noAck
                })
            ));
        });
        
    });

    describe("consumeType", function(){

        it("should create a exchange with the same name as the supplied type", function(){
            var settingsObject : any = settings();
            settingsObject.amqpSettings.queue.name = "TestQueue";
            settingsObject.amqpSettings.auditEnabled = false;

            var assertExchangeStub : any = sinon.stub(fakeChannel, "assertExchange");

            var client = new Client(settingsObject as any, async () =>{});
            client.channel = { addSetup: (cb : any) => cb(fakeChannel) } as any;

            client.consumeType("TestType123");

            assert.isTrue(assertExchangeStub.calledWith(
                "TestType123",
                "fanout",
                sinon.match({
                    durable: true
                })
            ));

            (fakeChannel as any).assertExchange.restore()
        });

        it("should bind the queue to the new exchange", function(){
            var settingsObject : any = settings();
            settingsObject.amqpSettings.queue.name = "TestQueue";
            settingsObject.amqpSettings.auditEnabled = false;

            var bindQueueStub : any = sinon.stub(fakeChannel, "bindQueue");

            var client = new Client(settingsObject as any, async () =>{});
            client.channel = { addSetup: (cb : any) => cb(fakeChannel) } as any;

            client.consumeType("TestType123");

            assert.isTrue(bindQueueStub.calledWith(
                settingsObject.amqpSettings.queue.name,
                "TestType123",
                ''
            ));

            (fakeChannel as any).bindQueue.restore();
        });

    });

    describe("removeType", function(){

        it("should unbind the queue from the exchange with name equal to the supplied type name", function(){
            var settingsObject : any = settings();
            settingsObject.amqpSettings.queue.name = "TestQueue";
            settingsObject.amqpSettings.auditEnabled = false;

            var unbindQueueStub : any = sinon.stub(fakeChannel, "unbindQueue");

            var client = new Client(settingsObject as any, async () =>{});
            client.channel = { removeSetup: (cb : any) => cb(fakeChannel) } as any;

            client.removeType("TestType123");

            assert.isTrue(unbindQueueStub.calledWith(
                settingsObject.amqpSettings.queue.name,
                "TestType123"
            ));

            ((fakeChannel as any).unbindQueue as any).restore();
        });

    });

    describe("send", function(){

        it("should send a message to the supplied endpoint", function(){
            var settingsObject : any = settings();
            settingsObject.amqpSettings.queue.name = "TestQueue";
            settingsObject.amqpSettings.auditEnabled = false;

            var sendToQueueStub : any = sinon.stub(fakeChannel, "sendToQueue");

            var client = new Client(settingsObject as any, async () =>{});
            client.channel = fakeChannel as any;

            var message = {
                CorrelationId: "abc",
                data: 123
            };

            client.send("TestEndpoint", "LogMessage", message, {});

            assert.isTrue(sendToQueueStub.calledWith(
                "TestEndpoint",
                sinon.match(v => {
                    return v.data == message.data;
                }),
                sinon.match.any
            ));

            (fakeChannel as any).sendToQueue.restore();
        });

        it("should send the correct message headings", function(){
            var settingsObject : any = settings();
            settingsObject.amqpSettings.queue.name = "TestQueue";
            settingsObject.amqpSettings.auditEnabled = false;

            var sendToQueueStub : any = sinon.stub(fakeChannel, "sendToQueue");

            var client = new Client(settingsObject as any, async () =>{});
            client.channel = fakeChannel as any;

            var message = {
                CorrelationId: "abc",
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

            (fakeChannel as any).sendToQueue.restore();
        });

        it("should send a message to the supplied endpoints if an array of endpoints is passed", function(){
            var settingsObject : any = settings();
            settingsObject.amqpSettings.queue.name = "TestQueue";
            settingsObject.amqpSettings.auditEnabled = false;

            var sendToQueueStub : any = sinon.stub(fakeChannel, "sendToQueue");

            var client = new Client(settingsObject as any, async () =>{});
            client.channel = fakeChannel as any;

            var message = {
                CorrelationId: "abc",
                data: 123
            };

            client.send(["TestEndpoint1", "TestEndpoint2"], "LogMessage", message);

            assert.isTrue(sendToQueueStub.calledWith(
                "TestEndpoint1",
                sinon.match(v => {
                    return v.data == message.data;
                }),
                sinon.match.any
            ));

            assert.isTrue(sendToQueueStub.calledWith(
                "TestEndpoint2",
                sinon.match(v => {
                    return v.data == message.data;
                }),
                sinon.match.any
            ));

            (fakeChannel as any).sendToQueue.restore();
        });

    });

    describe("publish", function(){

        var publishStub : any;
        var assertExchangeStub : any;

        beforeEach(function(){
            publishStub = sinon.stub(fakeChannel, "publish");
            assertExchangeStub = sinon.stub(fakeChannel, "assertExchange");
            assertExchangeStub.returns(new Promise<void>(function(r,_) {
              r();
            }));
            (fakeChannel as any).addSetup = (cb : any) => {
              return cb(fakeChannel);
            };
        });

        afterEach(async function(){
            (fakeChannel as any).publish.restore();
            (fakeChannel as any).assertExchange.restore()
        });

        it("should publish the message", async () => {
            var settingsObject : any = settings();
            settingsObject.amqpSettings.queue.name = "TestQueue";
            settingsObject.amqpSettings.auditEnabled = false;

            var client = new Client(settingsObject as any, async () =>{});
            client.channel = fakeChannel as any;

            var message = {
                CorrelationId: "abc",
                data: 123
            };

            try {
                await client.publish("LogMessage", message);

                assert.isTrue(publishStub.calledWith(
                    "LogMessage",
                    '',
                    sinon.match(v => {
                        return v.data == message.data;
                    }),
                    sinon.match.any
                ));

            } catch (error) {
                assert.isTrue(false);
            }
            

        });

        it("should publish the message with the correct headers", async () => {
            var settingsObject : any = settings();
            settingsObject.amqpSettings.queue.name = "TestQueue";
            settingsObject.amqpSettings.auditEnabled = false;

            var client = new Client(settingsObject as any, async () =>{});
            client.channel = fakeChannel as any;

            var message = {
                CorrelationId: "abc",
                data: 123
            };

            try {
                await client.publish("LogMessage", message, {
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
            } catch (error) {
                assert.isTrue(false);
            }

        });

        it("should assert that the exchange exists before publishing", async () => {
            var settingsObject : any = settings();
            settingsObject.amqpSettings.queue.name = "TestQueue";
            settingsObject.amqpSettings.auditEnabled = false;


            var client = new Client(settingsObject as any, async () =>{});
            client.channel = fakeChannel as any;

            var message = {
                CorrelationId: "abc",
                data: 123
            };

            try {
                await client.publish("LogMessage", message);
                assert.isTrue(assertExchangeStub.calledWith(
                    "LogMessage",
                    'fanout',
                    sinon.match({
                        durable: true
                    })
                ));
            } catch (error) {
                assert.isTrue(false);
            }

        });

    });

    describe("_processMessage", function() {

        var message : any;
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

        it("should set the correct headings", function(done){
            var settingsObject : any = settings();
            settingsObject.amqpSettings.queue.name = "TestQueue";

            var client = new Client(settingsObject, async () =>{} );
            client.channel = fakeChannel as any;
            client.consumeMessageCallback = sinon.stub().returns({ success: true });
            client._processMessage(message)
              .then(r => {
                expect(message.properties.headers.DestinationMachine).to.equal(os.hostname());
                expect(message.properties.headers.DestinationAddress).to.equal("TestQueue");
                expect(message.properties.headers.TimeProcessed).to.not.be.undefined;
                expect(message.properties.headers.TimeReceived).to.not.be.undefined;
                done();
              })
              .catch(err => {
                assert(false);
                done();
              });
        });

        it("should call the consumeMessageCallback function", function(done){
            var settingsObject : any = settings();
            settingsObject.amqpSettings.queue.name = "TestQueue";

            var client = new Client(settingsObject as any, async () =>{});
            client.channel = fakeChannel as any;
            (client.consumeMessageCallback as any) = sinon.stub().returns({ success: true });

            client._processMessage(message)
              .then(r => {
                assert.isTrue((client.consumeMessageCallback as any).calledWith(
                    sinon.match(JSON.parse(message.content.toString())),
                    sinon.match(message.properties.headers),
                    sinon.match(message.properties.headers.TypeName)));
                done();
              })
              .catch(err => {
                assert(false);
                done();
              });
        });

        it("if successful and auditing is enabled should send message to audit queue", function(done){
            var settingsObject : any = settings();
            settingsObject.amqpSettings.queue.name = "TestQueue";
            settingsObject.amqpSettings.auditEnabled = true;

            var sendToQueueStub : any = sinon.stub(fakeChannel, "sendToQueue");

            var client = new Client(settingsObject as any, async () =>{});
            client.channel = fakeChannel as any;
            client.consumeMessageCallback = sinon.stub().returns({ success: true });

            client._processMessage(message)
              .then(r => {
                assert.isTrue(sendToQueueStub.calledWith(
                    settingsObject.amqpSettings.auditQueue,
                    sinon.match(JSON.parse(message.content.toString())),
                    sinon.match({
                        headers: message.properties.headers,
                        messageId: message.properties.messageId
                    })
                ));

                (fakeChannel as any).sendToQueue.restore();
                done();
              })
              .catch(err => {
                assert(false);
                (fakeChannel as any).sendToQueue.restore();
                done();
              });
        });

        it("if successful and auditing is disabled should not send message to audit queue", function(done){
            var settingsObject : any = settings();
            settingsObject.amqpSettings.queue.name = "TestQueue";
            settingsObject.amqpSettings.auditEnabled = false;

            var sendToQueueStub : any = sinon.stub(fakeChannel, "sendToQueue");

            var client = new Client(settingsObject as any, async () =>{});
            client.channel = fakeChannel as any;
            client.consumeMessageCallback = sinon.stub().returns({ success: true });

            client._processMessage(message)
              .then(r => {
                assert.isFalse(sendToQueueStub.called);
                (fakeChannel as any).sendToQueue.restore();
                done();
              })
              .catch(err => {
                console.log(err);
                (fakeChannel as any).sendToQueue.restore();
                done();
              });
        });

        it("if consumeMessageCallback is not successful should send message to retry queue with retry count set to 1", function(done){
            var settingsObject : any = settings();
            settingsObject.amqpSettings.queue.name = "TestQueue";
            settingsObject.amqpSettings.auditEnabled = false;

            var sendToQueueStub : any = sinon.stub(fakeChannel, "sendToQueue");

            var client = new Client(settingsObject as any, async () =>{});
            client.channel = fakeChannel as any;
            client.consumeMessageCallback = sinon.stub().returns(new Promise((_, r) => r()));

            client._processMessage(message)
              .then(r => {
                assert.isTrue(sendToQueueStub.calledWith(
                    "TestQueue.Retries",
                    sinon.match(JSON.parse(message.content.toString())),
                    sinon.match({
                        headers: message.properties.headers,
                        messageId: message.properties.messageId
                    })
                ));

                expect(message.properties.headers.RetryCount).to.equal(1);

                (fakeChannel as any).sendToQueue.restore();
                done();
              })
              .catch(err => {
                (fakeChannel as any).sendToQueue.restore();
                assert(false);
                done();
              });
        });

        it("if result is not successful and headers already contain RetryCount should increment RetryCount " +
            "and assign to headers", function(done){
            var settingsObject : any = settings();
            settingsObject.amqpSettings.queue.name = "TestQueue";
            settingsObject.amqpSettings.auditEnabled = false;
            message.properties.headers.RetryCount = 1;

            var sendToQueueStub : any = sinon.stub(fakeChannel, "sendToQueue");

            var client = new Client(settingsObject as any, async () =>{});
            client.channel = fakeChannel as any;
            client.consumeMessageCallback = sinon.stub().returns(new Promise((_, r) => r()));

            client._processMessage(message)
              .then(r => {
                assert.isTrue(sendToQueueStub.calledWith(
                    "TestQueue.Retries",
                    sinon.match(JSON.parse(message.content.toString())),
                    sinon.match({
                        headers: message.properties.headers,
                        messageId: message.properties.messageId
                    })
                ));

                expect(message.properties.headers.RetryCount).to.equal(2);

                (fakeChannel as any).sendToQueue.restore();
                done();
              })
              .catch(err => {
                (fakeChannel as any).sendToQueue.restore();
                assert(false);
                done();
              });
        });

        it("if consumeMessageCallback is not successful and retry count has reached max should send message " +
            "to error queue", function(done){
            var settingsObject : any = settings();
            settingsObject.amqpSettings.queue.name = "TestQueue";
            settingsObject.amqpSettings.auditEnabled = false;
            message.properties.headers.RetryCount = 3;

            var sendToQueueStub : any = sinon.stub(fakeChannel, "sendToQueue");

            var client = new Client(settingsObject as any, async () =>{});
            client.channel = fakeChannel as any;
            client.consumeMessageCallback = sinon.stub().returns(new Promise((_, r) => r()));

            client._processMessage(message)
              .then(r => {
                (fakeChannel as any).sendToQueue.restore();

                assert.isTrue(sendToQueueStub.calledWith(
                    settingsObject.amqpSettings.errorQueue,
                    sinon.match(JSON.parse(message.content.toString())),
                    sinon.match({
                        headers: message.properties.headers,
                        messageId: message.properties.messageId
                    })
                ));
                done();
              })
              .catch(err => {
                (fakeChannel as any).sendToQueue.restore();
                assert(false);
                done();
              });
        });

        it("if consumeMessageCallback is not successful and retry count has reached max should add Exception " +
            "to headers", function(done){
            var settingsObject : any = settings();
            settingsObject.amqpSettings.queue.name = "TestQueue";
            settingsObject.amqpSettings.auditEnabled = false;
            message.properties.headers.RetryCount = 3;

            var sendToQueueStub : any = sinon.stub(fakeChannel, "sendToQueue");

            var client = new Client(settingsObject as any, async () =>{});
            client.channel = fakeChannel as any;
            client.consumeMessageCallback = sinon.stub().returns(new Promise((_, r) => r("Error")));

            client._processMessage(message)
              .then(r => {

                assert.isTrue(sendToQueueStub.calledWith(
                    settingsObject.amqpSettings.errorQueue,
                    sinon.match(JSON.parse(message.content.toString())),
                    sinon.match({
                        headers: message.properties.headers,
                        messageId: message.properties.messageId
                    })
                ));

                expect(message.properties.headers.Exception).to.equal("Error");
                (fakeChannel as any).sendToQueue.restore();

                done();
              })
              .catch(err => {
                (fakeChannel as any).sendToQueue.restore();
                assert(false);
                done();
              });
        });

    });

    describe("_consumeMessage", function(){

        var message : any;
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

        it("should throw exception if the typename is not in the headers", async function(){
            let error = "";
            var settingsObject : any = settings();
            settingsObject.amqpSettings.queue.name = "TestQueue";
            settingsObject.logger = {
                error: (msg : string, e : Error) => error = msg
            }
            message.properties.headers.TypeName = undefined;

            var client = new Client(settingsObject as any, async () =>{});
            client.channel = fakeChannel as any;
            client.consumeMessageCallback = sinon.stub().returns({ success: true });

            await client._consumeMessage(message);    
            
            expect(error).to.equal("Message does not contain TypeName");
        });

        it("should ack message if exception is thrown", function(done){
            var settingsObject : any = settings();
            settingsObject.amqpSettings.queue.name = "TestQueue";
            message.properties.headers.TypeName = "TestType";

            var ackStub = sinon.stub(fakeChannel, "ack").callsFake(((p : any) => {
              expect(p).to.equal(message);
              (fakeChannel as any).ack.restore();
              done();
            }) as any);

            var client = new Client(settingsObject as any, async () =>{});
            client.channel = fakeChannel as any;
            client._processMessage = sinon.stub().returns(new Promise((_, rej) => rej()));

            client._consumeMessage(message);
        });

        it("should ack after processing the message if noAck is false", function(done){
            var settingsObject : any = settings();
            settingsObject.amqpSettings.queue.name = "TestQueue";
            settingsObject.amqpSettings.queue.noAck = false;
            settingsObject.amqpSettings.auditEnabled = false;

            var ackStub = sinon.stub(fakeChannel, "ack").callsFake(((p : any) => {
              expect(p).to.equal(message);
              (fakeChannel as any).ack.restore();
              done();
            }) as any);

            var client = new Client(settingsObject as any, async () =>{});
            client.channel = fakeChannel as any;
            client._processMessage = sinon.stub().returns(new Promise<void>((res, _) => res()));
            client._consumeMessage(message);

        });
    });

    describe("close", function(){

        it("should close the channel", async function(){
            var closeStub = sinon.stub(fakeChannel._channel, "cancel");

            var client = new Client(settings() as any, async () =>{});
            client.channel = fakeChannel as any;
            client.connection = {
                close: sinon.stub()
            } as any;
            await client.close();

            assert.isTrue(closeStub.called, "channel cancelled");
            assert.isTrue((client.connection as any).close.called, "connection closed");

            (fakeChannel as any)._channel.cancel.restore();
        });

        it("should delete the retry queue if autoDelete is enabled", async function(){
            var settingsObject : any = settings();
            settingsObject.amqpSettings.queue.name = "TestQueue";
            settingsObject.amqpSettings.queue.autoDelete = true;

            var client = new Client(settingsObject as any, async () =>{});
            client.channel = { 
                removeSetup: sinon.stub(),
                _channel: { cancel: sinon.stub(), deleteQueue: sinon.stub(), consumers: {}, close: sinon.stub() },
                consumers: []
            } as any;

            await client.close();

            expect(((client.channel as any)._channel.deleteQueue as any).called).to.be.true;
        });
    });
});
