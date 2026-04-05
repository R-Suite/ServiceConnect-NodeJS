
import Client from '../src/clients/rabbitMQ';
import chai from 'chai';
import sinon from 'sinon';
import amqp from 'amqp-connection-manager';
import settings from '../src/settings';
import os from 'os';

let expect = chai.expect;
let assert = chai.assert;

describe("RabbitMQ Client", function() {
    let sandbox: sinon.SinonSandbox;

    beforeEach(function() {
        sandbox = sinon.createSandbox();
    });

    afterEach(function() {
        sandbox.restore();
    });

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

        it("should connect to the amqp client", async function(){
            // Create mock connection that emits 'connect' immediately
            var mockConnection = {
                on: sandbox.stub().callsFake((event: string, cb: Function) => {
                    if (event === 'connect') {
                        setImmediate(() => cb());
                    }
                }),
                isConnected: sandbox.stub().returns(true),
                close: sandbox.stub().resolves(),
                createChannel: sandbox.stub().returns({
                    on: sandbox.stub().callsFake((event: string, cb: Function) => {
                        if (event === 'connect') {
                            setImmediate(() => cb());
                        }
                    }),
                    addSetup: sandbox.stub().resolves()
                })
            };

            var connectStub = sandbox.stub(amqp, 'connect').returns(mockConnection as any);

            var client = new Client(settings() as any, async () =>{});
            await client.connect();

            assert.isTrue(connectStub.called);
        });

        it("should create channel after connecting", async function(){
            // Create mock connection that emits 'connect' immediately
            var mockConnection = {
                on: sandbox.stub().callsFake((event: string, cb: Function) => {
                    if (event === 'connect') {
                        setImmediate(() => cb());
                    }
                }),
                isConnected: sandbox.stub().returns(true),
                close: sandbox.stub().resolves(),
                createChannel: sandbox.stub().returns({
                    on: sandbox.stub().callsFake((event: string, cb: Function) => {
                        if (event === 'connect') {
                            setImmediate(() => cb());
                        }
                    }),
                    addSetup: sandbox.stub().resolves()
                })
            };

            sandbox.stub(amqp, 'connect').returns(mockConnection as any);

            var client = new Client(settings() as any, async () =>{});
            await client.connect();

            assert.isTrue(mockConnection.createChannel.called);
        });

    });

    describe("_createQueues", function(){
        var assertQueueStub : any, assertExchangeStub: any, bindQueueStub : any, consumeStub : any;
        
        beforeEach(() => {
            assertQueueStub = sandbox.stub(fakeChannel, "assertQueue").resolves();
            assertExchangeStub = sandbox.stub(fakeChannel, "assertExchange").resolves();
            bindQueueStub = sandbox.stub(fakeChannel, "bindQueue").resolves();            
            consumeStub = sandbox.stub(fakeChannel, "consume").resolves();
        });

        afterEach(() => {
            sandbox.restore();
        })

        it("should create the queues", async function(){
            var settingsObject : any = settings();
            settingsObject.amqpSettings.queue.name = "TestQueue";

            var client = new Client(settingsObject as any, async () =>{});
            await client._createQueues(fakeChannel as any);

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
                sinon.match.func,
                sinon.match({
                    noAck: settingsObject.amqpSettings.queue.noAck
                })
            ));
        });
        
    });

    describe("consumeType", function(){

        it("should create a exchange with the same name as the supplied type", async function(){
            var settingsObject : any = settings();
            settingsObject.amqpSettings.queue.name = "TestQueue";
            settingsObject.amqpSettings.auditEnabled = false;

            var assertExchangeStub : any = sandbox.stub(fakeChannel, "assertExchange").resolves();

            // Create a mock channel with addSetup that simulates ChannelWrapper
            var mockChannel = {
                addSetup: async (cb: any) => {
                    await cb(fakeChannel);
                },
                on: sandbox.stub()
            };

            var client = new Client(settingsObject as any, async () =>{});
            // Set the channel AND mock the connection manager
            (client as any).connectionManager = { getChannel: () => mockChannel };
            client.channel = mockChannel as any;

            await client.consumeType("TestType123");

            assert.isTrue(assertExchangeStub.calledWith(
                "TestType123",
                "fanout",
                sinon.match({
                    durable: true
                })
            ));
        });

        it("should bind the queue to the new exchange", async function(){
            var settingsObject : any = settings();
            settingsObject.amqpSettings.queue.name = "TestQueue";
            settingsObject.amqpSettings.auditEnabled = false;

            var bindQueueStub : any = sandbox.stub(fakeChannel, "bindQueue").resolves();

            // Create a mock channel with addSetup that simulates ChannelWrapper
            var mockChannel = {
                addSetup: async (cb: any) => {
                    await cb(fakeChannel);
                },
                on: sandbox.stub()
            };

            var client = new Client(settingsObject as any, async () =>{});
            // Set the channel AND mock the connection manager
            (client as any).connectionManager = { getChannel: () => mockChannel };
            client.channel = mockChannel as any;

            await client.consumeType("TestType123");

            assert.isTrue(bindQueueStub.calledWith(
                settingsObject.amqpSettings.queue.name,
                "TestType123",
                ''
            ));
        });

    });

    describe("removeType", function(){

        it("should unbind the queue from the exchange with name equal to the supplied type name", async function(){
            var settingsObject : any = settings();
            settingsObject.amqpSettings.queue.name = "TestQueue";
            settingsObject.amqpSettings.auditEnabled = false;

            var unbindQueueStub : any = sandbox.stub(fakeChannel, "unbindQueue").resolves();

            // Create a mock channel with removeSetup that simulates ChannelWrapper
            var mockChannel = {
                removeSetup: async (cb: any) => {
                    await cb(fakeChannel);
                },
                on: sandbox.stub()
            };

            var client = new Client(settingsObject as any, async () =>{});
            // Set the channel AND mock the connection manager
            (client as any).connectionManager = { getChannel: () => mockChannel };
            client.channel = mockChannel as any;

            await client.removeType("TestType123");

            assert.isTrue(unbindQueueStub.calledWith(
                settingsObject.amqpSettings.queue.name,
                "TestType123"
            ));
        });

    });

    describe("send", function(){

        it("should send a message to the supplied endpoint", async function(){
            var settingsObject : any = settings();
            settingsObject.amqpSettings.queue.name = "TestQueue";
            settingsObject.amqpSettings.auditEnabled = false;

            var sendToQueueStub : any = sandbox.stub(fakeChannel, "sendToQueue").resolves();

            var client = new Client(settingsObject as any, async () =>{});
            // Set up the channel properly with mocked connection manager
            var mockChannel = { sendToQueue: sendToQueueStub, on: sandbox.stub() };
            (client as any).connectionManager = { getChannel: () => mockChannel };
            client.channel = mockChannel as any;

            var message = {
                CorrelationId: "abc",
                data: 123
            };

            await client.send("TestEndpoint", "LogMessage", message, {});

            assert.isTrue(sendToQueueStub.calledWith(
                "TestEndpoint",
                sinon.match((v: any) => {
                    return v.data == message.data;
                }),
                sinon.match.any
            ));
        });

        it("should send the correct message headings", async function(){
            var settingsObject : any = settings();
            settingsObject.amqpSettings.queue.name = "TestQueue";
            settingsObject.amqpSettings.auditEnabled = false;

            var sendToQueueStub : any = sandbox.stub(fakeChannel, "sendToQueue").resolves();

            var client = new Client(settingsObject as any, async () =>{});
            // Set up the channel properly with mocked connection manager
            var mockChannel = { sendToQueue: sendToQueueStub, on: sandbox.stub() };
            (client as any).connectionManager = { getChannel: () => mockChannel };
            client.channel = mockChannel as any;

            var message = {
                CorrelationId: "abc",
                data: 123
            };

            await client.send("TestEndpoint", "LogMessage", message, {
                customHeader: 123
            });

            // Verify sendToQueue was called with the correct endpoint and check headers in call args
            assert.isTrue(sendToQueueStub.calledWith("TestEndpoint"));
            const callArgs = sendToQueueStub.getCall(0).args;
            const headers = callArgs[2].headers;
            expect(headers.customHeader).to.equal(123);
            expect(headers.DestinationAddress).to.equal("TestEndpoint");
            expect(headers.MessageType).to.equal("Send");
            expect(headers.SourceAddress).to.equal("TestQueue");
            expect(headers.TypeName).to.equal("LogMessage");
            expect(headers.ConsumerType).to.equal("RabbitMQ");
            expect(headers.Language).to.equal("TypeScript");
        });

        it("should send a message to the supplied endpoints if an array of endpoints is passed", async function(){
            var settingsObject : any = settings();
            settingsObject.amqpSettings.queue.name = "TestQueue";
            settingsObject.amqpSettings.auditEnabled = false;

            var sendToQueueStub : any = sandbox.stub(fakeChannel, "sendToQueue").resolves();

            var client = new Client(settingsObject as any, async () =>{});
            // Set up the channel properly with mocked connection manager
            var mockChannel = { sendToQueue: sendToQueueStub, on: sandbox.stub() };
            (client as any).connectionManager = { getChannel: () => mockChannel };
            client.channel = mockChannel as any;

            var message = {
                CorrelationId: "abc",
                data: 123
            };

            await client.send(["TestEndpoint1", "TestEndpoint2"], "LogMessage", message, {});

            assert.isTrue(sendToQueueStub.calledWith(
                "TestEndpoint1",
                sinon.match((v: any) => {
                    return v.data == message.data;
                }),
                sinon.match.any
            ));

            assert.isTrue(sendToQueueStub.calledWith(
                "TestEndpoint2",
                sinon.match((v: any) => {
                    return v.data == message.data;
                }),
                sinon.match.any
            ));
        });

    });

    describe("publish", function(){

        var publishStub : any;
        var assertExchangeStub : any;

        beforeEach(function(){
            publishStub = sandbox.stub(fakeChannel, "publish").resolves();
            assertExchangeStub = sandbox.stub(fakeChannel, "assertExchange").resolves();
        });

        afterEach(function(){
            sandbox.restore();
        });

        it("should publish the message", async () => {
            var settingsObject : any = settings();
            settingsObject.amqpSettings.queue.name = "TestQueue";
            settingsObject.amqpSettings.auditEnabled = false;

            // Create a mock channel that properly handles addSetup
            var mockChannel = {
                addSetup: async (cb: any) => {
                    await cb(fakeChannel);
                },
                publish: publishStub,
                on: sandbox.stub()
            };

            var client = new Client(settingsObject as any, async () =>{});
            // Set the channel AND mock the connection manager
            (client as any).connectionManager = { getChannel: () => mockChannel };
            client.channel = mockChannel as any;

            var message = {
                CorrelationId: "abc",
                data: 123
            };

            try {
                await client.publish("LogMessage", message, {});

                assert.isTrue(publishStub.calledWith(
                    "LogMessage",
                    '',
                    sinon.match((v: any) => {
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

            // Create a mock channel that properly handles addSetup
            var mockChannel = {
                addSetup: async (cb: any) => {
                    await cb(fakeChannel);
                },
                publish: publishStub,
                on: sandbox.stub()
            };

            var client = new Client(settingsObject as any, async () =>{});
            // Set the channel AND mock the connection manager
            (client as any).connectionManager = { getChannel: () => mockChannel };
            client.channel = mockChannel as any;

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
                            Language: "TypeScript"
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

            // Create a mock channel that properly handles addSetup
            var mockChannel = {
                addSetup: async (cb: any) => {
                    await cb(fakeChannel);
                },
                publish: publishStub,
                on: sandbox.stub()
            };

            var client = new Client(settingsObject as any, async () =>{});
            // Set the channel AND mock the connection manager
            (client as any).connectionManager = { getChannel: () => mockChannel };
            client.channel = mockChannel as any;

            var message = {
                CorrelationId: "abc",
                data: 123
            };

            try {
                await client.publish("LogMessage", message, {});
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
                content: Buffer.from(JSON.stringify({
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

        it("should set the correct headings", async function(){
            var settingsObject : any = settings();
            settingsObject.amqpSettings.queue.name = "TestQueue";

            var client = new Client(settingsObject, async () =>{} );
            client.channel = fakeChannel as any;
            client.consumeMessageCallback = sandbox.stub().resolves({ success: true });
            
            await client._processMessage(message);
            
            expect(message.properties.headers.DestinationMachine).to.equal(os.hostname());
            expect(message.properties.headers.DestinationAddress).to.equal("TestQueue");
            expect(message.properties.headers.TimeProcessed).to.not.be.undefined;
            expect(message.properties.headers.TimeReceived).to.not.be.undefined;
        });

        it("should call the consumeMessageCallback function", async function(){
            var settingsObject : any = settings();
            settingsObject.amqpSettings.queue.name = "TestQueue";

            var client = new Client(settingsObject as any, async () =>{});
            client.channel = fakeChannel as any;
            var callbackStub = sandbox.stub().resolves({ success: true });
            (client.consumeMessageCallback as any) = callbackStub;

            await client._processMessage(message);
            
            assert.isTrue(callbackStub.calledWith(
                sinon.match(JSON.parse(message.content.toString())),
                sinon.match(message.properties.headers),
                sinon.match(message.properties.headers.TypeName)));
        });

        it("if successful and auditing is enabled should send message to audit queue", async function(){
            var settingsObject : any = settings();
            settingsObject.amqpSettings.queue.name = "TestQueue";
            settingsObject.amqpSettings.auditEnabled = true;

            var sendToQueueStub : any = sandbox.stub(fakeChannel, "sendToQueue").resolves();

            var client = new Client(settingsObject as any, async () =>{});
            client.channel = fakeChannel as any;
            // Need to mock the connectionManager.getChannel() to return the fakeChannel for audit
            (client as any).connectionManager = { getChannel: () => fakeChannel };
            client.consumeMessageCallback = sandbox.stub().resolves({ success: true });

            await client._processMessage(message);
            
            assert.isTrue(sendToQueueStub.calledWith(
                settingsObject.amqpSettings.auditQueue,
                sinon.match(JSON.parse(message.content.toString())),
                sinon.match({
                    headers: message.properties.headers,
                    messageId: message.properties.messageId
                })
            ));
        });

        it("if successful and auditing is disabled should not send message to audit queue", async function(){
            var settingsObject : any = settings();
            settingsObject.amqpSettings.queue.name = "TestQueue";
            settingsObject.amqpSettings.auditEnabled = false;

            var sendToQueueStub : any = sandbox.stub(fakeChannel, "sendToQueue").resolves();

            var client = new Client(settingsObject as any, async () =>{});
            client.channel = fakeChannel as any;
            // Need to mock the connectionManager.getChannel() to return the fakeChannel
            (client as any).connectionManager = { getChannel: () => fakeChannel };
            client.consumeMessageCallback = sandbox.stub().resolves({ success: true });

            await client._processMessage(message);
            
            assert.isFalse(sendToQueueStub.called);
        });

        it("if consumeMessageCallback is not successful should send message to retry queue with retry count set to 1", async function(){
            var settingsObject : any = settings();
            settingsObject.amqpSettings.queue.name = "TestQueue";
            settingsObject.amqpSettings.auditEnabled = false;

            var sendToQueueStub : any = sandbox.stub(fakeChannel, "sendToQueue").resolves();

            var client = new Client(settingsObject as any, async () =>{});
            client.channel = fakeChannel as any;
            // Need to mock the connectionManager.getChannel() to return the fakeChannel
            (client as any).connectionManager = { getChannel: () => fakeChannel };
            // Stub returning rejected promise with an error
            client.consumeMessageCallback = sandbox.stub().rejects(new Error("Processing failed"));

            // _processMessage throws when callback rejects, so we need to catch it
            try {
                await client._processMessage(message);
            } catch (e) {
                // Expected to throw
            }
            
            assert.isTrue(sendToQueueStub.calledWith(
                "TestQueue.Retries",
                sinon.match(JSON.parse(message.content.toString())),
                sinon.match({
                    headers: message.properties.headers,
                    messageId: message.properties.messageId
                })
            ));

            expect(message.properties.headers.RetryCount).to.equal(1);
        });

        it("if result is not successful and headers already contain RetryCount should increment RetryCount " +
            "and assign to headers", async function(){
            var settingsObject : any = settings();
            settingsObject.amqpSettings.queue.name = "TestQueue";
            settingsObject.amqpSettings.auditEnabled = false;
            message.properties.headers.RetryCount = 1;

            var sendToQueueStub : any = sandbox.stub(fakeChannel, "sendToQueue").resolves();

            var client = new Client(settingsObject as any, async () =>{});
            client.channel = fakeChannel as any;
            // Need to mock the connectionManager.getChannel() to return the fakeChannel
            (client as any).connectionManager = { getChannel: () => fakeChannel };
            client.consumeMessageCallback = sandbox.stub().rejects(new Error("Processing failed"));

            // _processMessage throws when callback rejects, so we need to catch it
            try {
                await client._processMessage(message);
            } catch (e) {
                // Expected to throw
            }
            
            assert.isTrue(sendToQueueStub.calledWith(
                "TestQueue.Retries",
                sinon.match(JSON.parse(message.content.toString())),
                sinon.match({
                    headers: message.properties.headers,
                    messageId: message.properties.messageId
                })
            ));

            expect(message.properties.headers.RetryCount).to.equal(2);
        });

        it("if consumeMessageCallback is not successful and retry count has reached max should send message " +
            "to error queue", async function(){
            var settingsObject : any = settings();
            settingsObject.amqpSettings.queue.name = "TestQueue";
            settingsObject.amqpSettings.auditEnabled = false;
            message.properties.headers.RetryCount = 3;

            var sendToQueueStub : any = sandbox.stub(fakeChannel, "sendToQueue").resolves();

            var client = new Client(settingsObject as any, async () =>{});
            client.channel = fakeChannel as any;
            // Need to mock the connectionManager.getChannel() to return the fakeChannel
            (client as any).connectionManager = { getChannel: () => fakeChannel };
            client.consumeMessageCallback = sandbox.stub().rejects(new Error("Processing failed"));

            // _processMessage throws when callback rejects, so we need to catch it
            try {
                await client._processMessage(message);
            } catch (e) {
                // Expected to throw
            }
            
            assert.isTrue(sendToQueueStub.calledWith(
                settingsObject.amqpSettings.errorQueue,
                sinon.match(JSON.parse(message.content.toString())),
                sinon.match({
                    headers: message.properties.headers,
                    messageId: message.properties.messageId
                })
            ));
        });

        it("if consumeMessageCallback is not successful and retry count has reached max should add Exception " +
            "to headers", async function(){
            var settingsObject : any = settings();
            settingsObject.amqpSettings.queue.name = "TestQueue";
            settingsObject.amqpSettings.auditEnabled = false;
            message.properties.headers.RetryCount = 3;

            var sendToQueueStub : any = sandbox.stub(fakeChannel, "sendToQueue").resolves();

            var client = new Client(settingsObject as any, async () =>{});
            client.channel = fakeChannel as any;
            // Need to mock the connectionManager.getChannel() to return the fakeChannel
            (client as any).connectionManager = { getChannel: () => fakeChannel };
            client.consumeMessageCallback = sandbox.stub().rejects("Error");

            // _processMessage throws when callback rejects, so we need to catch it
            try {
                await client._processMessage(message);
            } catch (e) {
                // Expected to throw
            }
            
            // Verify sendToQueue was called and check the exception in the headers
            assert.isTrue(sendToQueueStub.calledWith(
                settingsObject.amqpSettings.errorQueue,
                sinon.match.any,
                sinon.match.any
            ));
            
            // Check the headers passed to sendToQueue
            const callArgs = sendToQueueStub.getCall(0).args;
            const headers = callArgs[2].headers;
            expect(headers.Exception).to.equal("Error");
        });

    });

    describe("close", function(){

        it("should close the channel", async function(){
            var cancelStub = sandbox.stub(fakeChannel._channel, "cancel");

            var client = new Client(settings() as any, async () =>{});
            client.channel = fakeChannel as any;
            
            // Mock connectionManager with getChannel returning the fakeChannel
            (client as any).connectionManager = {
                getChannel: () => fakeChannel,
                close: sandbox.stub().resolves()
            };
            
            await client.close();

            assert.isTrue(cancelStub.called, "channel cancelled");
        });

        it("should delete the retry queue if autoDelete is enabled", async function(){
            var settingsObject : any = settings();
            settingsObject.amqpSettings.queue.name = "TestQueue";
            settingsObject.amqpSettings.queue.autoDelete = true;

            var deleteQueueStub = sandbox.stub();
            var cancelStub = sandbox.stub();

            var mockChannel = { 
                removeSetup: sandbox.stub().resolves(),
                _channel: { cancel: cancelStub, deleteQueue: deleteQueueStub, consumers: {}, close: sandbox.stub() },
                consumers: []
            };

            var client = new Client(settingsObject as any, async () =>{});
            client.channel = mockChannel as any;
            
            // Mock connectionManager with getChannel returning the mockChannel
            (client as any).connectionManager = {
                getChannel: () => mockChannel,
                close: sandbox.stub().resolves()
            };

            await client.close();

            expect(deleteQueueStub.called).to.be.true;
        });
    });
});
