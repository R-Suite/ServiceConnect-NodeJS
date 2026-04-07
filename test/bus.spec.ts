
import { Bus } from '../src/index';
import chai from 'chai';
import sinon from 'sinon';
import settings from '../src/settings';

let expect = chai.expect;
let assert = chai.assert;

var settingsObject = settings();

describe("Bus", function() {

    var connectStub : any;

    beforeEach(function(){
        connectStub = sinon.stub(settingsObject.client.prototype, 'connect');
    });

    afterEach(function(){
        (settingsObject.client as any).prototype.connect.restore();
    });

    describe("Constructor", function() {

        it("should create build config", async function() {
            let bus = new Bus({
                amqpSettings: {
                    queue: {
                        name: 'ServiceConnectWebTest'
                    }
                },
                handlers: {
                    "LogCommand": [console.log]
                }
            });
            await bus.init();

            // Queue
            expect(bus.config.amqpSettings.queue.name).to.equal("ServiceConnectWebTest");
            expect(bus.config.amqpSettings.queue.durable).to.equal(true);
            expect(bus.config.amqpSettings.queue.exclusive).to.equal(false);
            expect(bus.config.amqpSettings.queue.autoDelete).to.equal(false);
            expect(bus.config.amqpSettings.queue.noAck).to.equal(false);

            // SSL
            expect(bus.config.amqpSettings.ssl?.enabled).to.equal(false);
            expect(bus.config.amqpSettings.ssl?.key).to.equal(null);
            expect(bus.config.amqpSettings.ssl?.passphrase).to.equal(null);
            expect(bus.config.amqpSettings.ssl?.cert).to.equal(null);
            expect(bus.config.amqpSettings.ssl?.ca).to.be.a('Array');
            expect(bus.config.amqpSettings.ssl?.ca).to.have.length(0);
            expect(bus.config.amqpSettings.ssl?.pfx).to.equal(null);
            expect(bus.config.amqpSettings.ssl?.fail_if_no_peer_cert).to.equal(false);
            expect(bus.config.amqpSettings.ssl?.verify).to.equal('verify_peer');

            // Other
            expect(bus.config.amqpSettings.host).to.equal("amqp://localhost");
            expect(bus.config.amqpSettings.retryDelay).to.equal(3000);
            expect(bus.config.amqpSettings.maxRetries).to.equal(3);
            expect(bus.config.amqpSettings.errorQueue).to.equal("errors");
            expect(bus.config.amqpSettings.auditQueue).to.equal("audit");
            expect(bus.config.amqpSettings.auditEnabled).to.equal(false);
        });

        it("should replace host array instead of concatenating with defaults", async function() {
            let bus = new Bus({
                amqpSettings: {
                    queue: { name: 'ServiceConnectWebTest' },
                    host: ['amqp://host1', 'amqp://host2']
                }
            });
            await bus.init();

            expect(bus.config.amqpSettings.host).to.deep.equal(['amqp://host1', 'amqp://host2']);
        });
    });

    describe("init", function() {

        it("should initialize the bus", async function() {
            let bus = new Bus({
                amqpSettings: {
                    queue: {
                        name: 'ServiceConnectWebTest'
                    }
                },
                handlers: {
                    "LogCommand": [console.log]
                }
            });

            await bus.init();

            assert.isTrue(connectStub.called);
            assert.isTrue(bus.initialized);
        });
    });

    describe("addHandler", function(){

        var consumeTypeStub : any;
        beforeEach(function(){
            consumeTypeStub = sinon.stub(settingsObject.client.prototype, 'consumeType');
        });

        afterEach(function(){
            (settingsObject.client as any).prototype.consumeType.restore();
        });

        it("should call consumeType on client", async function(){
            let bus = new Bus({
                amqpSettings: {
                    queue: {
                        name: 'ServiceConnectWebTest'
                    }
                },
                handlers: {
                    "LogCommand": [console.log]
                }
            });
            await bus.init();

            bus.addHandler("Test.Message", () => {});

            assert.isTrue(consumeTypeStub.calledWith("TestMessage"));
        });

        it("should allow adding handler after init", async function(){
            let bus = new Bus({
                amqpSettings: {
                    queue: {
                        name: 'ServiceConnectWebTest'
                    }
                }
            });
            await bus.init();
            var cb = () => {};
            await bus.addHandler("Test.Message",cb );
            expect(bus.isHandled("Test.Message")).to.be.true;
        });

        it("* message type should not call consumeType on client", async function(){
            let bus = new Bus({
                amqpSettings: {
                    queue: {
                        name: 'ServiceConnectWebTest'
                    }
                },
                handlers: {
                    "LogCommand": [console.log]
                }
            });
            await bus.init();

            bus.addHandler("*", () => {});

            assert.isFalse(consumeTypeStub.called);
        });

        it("should add * message type handler", async function(){
            let bus = new Bus({
                amqpSettings: {
                    queue: {
                        name: 'ServiceConnectWebTest'
                    }
                },
                handlers: {
                    "LogCommand": [console.log]
                }
            });
            await bus.init();
            var cb = () => {};
            bus.addHandler("*",cb );
            expect(bus.isHandled("*")).to.be.true;
        });
    });

    describe("removeHandler", function(){

        var removeTypeStub : any;
        beforeEach(function(){
            removeTypeStub = sinon.stub(settingsObject.client.prototype, 'removeType');
        });

        afterEach(function(){
            (settingsObject.client as any).prototype.removeType.restore();
        });

        it("should remove handler mapping from handler dictionary", async function(){
            var cb = () => {};
            var cb2 = () => {};
            let bus = new Bus({
                amqpSettings: {
                    queue: {
                        name: 'ServiceConnectWebTest'
                    }
                },
                handlers: {
                    "Test.Message": [cb, cb2],
                    "Test.Message2": [() => {}]
                }
            });
            await bus.init();

            bus.removeHandler("Test.Message", cb);
            expect(bus.isHandled("Test.Message")).to.be.true;
        });

        it("if all callbacks have been removed for a type then removeType should be called on client", async function(){
            var cb = () => {};
            let bus = new Bus({
                amqpSettings: {
                    queue: {
                        name: 'ServiceConnectWebTest'
                    }
                },
                handlers: {
                    "Test.Message": [cb],
                    "Test.Message2": [() => {}]
                }
            });
            await bus.init();

            bus.removeHandler("Test.Message",cb );
            assert.isTrue(removeTypeStub.calledWith("TestMessage"));
        });

        it("if all callbacks have not been removed for a message type then removeType should not be " +
           "called on the client", async function(){

            var cb = () => {};
            var cb2 = () => {};
            let bus = new Bus({
                amqpSettings: {
                    queue: {
                        name: 'ServiceConnectWebTest'
                    }
                },
                handlers: {
                    "Test.Message": [cb, cb2],
                    "Test.Message2": [() => {}]
                }
            });
            await bus.init();

            bus.removeHandler("Test.Message", cb);
            assert.isFalse(removeTypeStub.calledWith("TestMessage"));
        });

    });

    describe("isHandled", function(){

        it("should return true if message type is mapped to a callback", async function(){

            let bus = new Bus({
                amqpSettings: {
                    queue: {
                        name: 'ServiceConnectWebTest'
                    }
                },
                handlers: {
                    "LogCommand": [console.log]
                }
            });
            await bus.init();

            var isHandled = bus.isHandled("LogCommand");

            expect(isHandled).to.be.true;
        });

        it("should return false if message type is not mapped to a callback", async function(){

            let bus = new Bus({
                amqpSettings: {
                    queue: {
                        name: 'ServiceConnectWebTest'
                    }
                },
                handlers: {
                    "LogCommand": [console.log]
                }
            });

            await bus.init();

            var isHandled = bus.isHandled("LogCommand2");

            expect(isHandled).to.be.false;
        });

        it("should return false if message type has 0 callbacks", async function(){

            let bus = new Bus({
                amqpSettings: {
                    queue: {
                        name: 'ServiceConnectWebTest'
                    }
                },
                handlers: {
                    "LogCommand": []
                }
            });
            await bus.init();

            var isHandled = bus.isHandled("LogCommand");

            expect(isHandled).to.be.false;
        });

    });

    describe("send", function(){

        var stub : any;
        beforeEach(function() {
            stub = sinon.stub(settingsObject.client.prototype, 'send');
        });

        afterEach(function() {
            (settingsObject.client as any).prototype.send.restore();
        });

        it("should send message to client", async () => {
            let bus = new Bus({ amqpSettings: { queue:{name: "Test"} } }),
                endpoint = "TestEndpoint",
                type = "MessageType",
                message = {
                    CorrelationId: "abc",
                    data: "1234"
                },
                headers = { "Token": 1234567 };
            await bus.init();

            await bus.send(endpoint, type, message, headers);

            assert.isTrue(stub.calledWith(endpoint, type, message, headers));
        });

    });

    describe("publish", function(){

        var stub : any;
        beforeEach(function() {
            stub = sinon.stub(settingsObject.client.prototype, 'publish');
        });

        afterEach(function() {
            (settingsObject.client as any).prototype.publish.restore();
        });

        it("should publish message to client", async () => {
            let bus = new Bus({ amqpSettings: { queue:{name: "Test"} } }),
                type = "MessageType",
                message = {
                    CorrelationId: "abc",
                    data: "1234"
                },
                headers = { "Token": 1234567 };

            await bus.init();
            await bus.publish(type, message, headers);

            assert.isTrue(stub.calledWith(type, message, headers));
        });

    });

    describe("sendRequest", function(){

        var stub : any;
        beforeEach(function() {
            stub = sinon.stub(settingsObject.client.prototype, 'send');
        });

        afterEach(function() {
            (settingsObject.client as any).prototype.send.restore();
        });

        it("should send message to client", async () => {
            let bus = new Bus({ amqpSettings: { queue:{name: "Test"} } }),
                endpoint = "TestEndpoint",
                type = "MessageType",
                message = {
                    CorrelationId: "abc",
                    data: "1234"
                },
                headers = { "Token": 1234567 },
                callback = ()=> {};
            await bus.init();

            await bus.sendRequest(endpoint, type, message, callback, headers);

            assert.isTrue(stub.calledWith(endpoint, type, message, sinon.match({
                "Token": 1234567,
                "RequestMessageId": sinon.match.string
            })));
        });

    });

    describe("publishRequest", function(){

        var stub : any, sendStub : any;
        beforeEach(function() {
            stub = sinon.stub(settingsObject.client.prototype, 'publish');
            sendStub = sinon.stub(settingsObject.client.prototype, 'send');
        });

        afterEach(function() {
            (settingsObject.client as any).prototype.publish.restore();
            (settingsObject.client as any).prototype.send.restore();
        });

        it("should publish message to client", async () => {
            let bus = new Bus({ amqpSettings: { queue:{name: "Test"} } }),
                type = "MessageType",
                message = {
                    CorrelationId: "abc",
                    data: "1234"
                },
                headers = { "Token": 1234567 },
                callback = sinon.stub();

            await bus.init();
            await bus.publishRequest(type, message, callback, 1, null, headers);

            assert.isTrue(!callback.called);
            assert.isTrue(stub.calledWith(type, message, sinon.match({
                "Token": 1234567,
                "RequestMessageId": sinon.match.string
            })));
        });

    });

    describe("close", function(){

        var stub : any;
        beforeEach(function() {
            stub = sinon.stub(settingsObject.client.prototype, 'close');
        });

        afterEach(function() {
            (settingsObject.client as any).prototype.close.restore();
        });

        it("should close the client", async function(){
            let bus = new Bus({ amqpSettings: { queue:{name: "Test"} } });
            await bus.init();

            bus.close();

            assert.isTrue(stub.called);
        });

    });

    describe("createReplyCallback", function() {
        var sendStub: any;
        var consumeTypeStub: any;

        beforeEach(function() {
            sendStub = sinon.stub(settingsObject.client.prototype, 'send');
            consumeTypeStub = sinon.stub(settingsObject.client.prototype, 'consumeType');
        });

        afterEach(function() {
            (settingsObject.client as any).prototype.send.restore();
            (settingsObject.client as any).prototype.consumeType.restore();
        });

        it("should not mutate original headers when reply is sent", async function() {
            let bus = new Bus({ amqpSettings: { queue: { name: 'Test' } } });
            await bus.init();

            const originalHeaders: Record<string, unknown> = {
                RequestMessageId: 'req-123',
                SourceAddress: 'source-queue',
                TypeName: 'TestMessage'
            };
            const headersBefore = { ...originalHeaders };

            // Access the private consumeMessage method to trigger reply callback creation
            const consumeMessage = (bus as any).consumeMessage.bind(bus);

            // Add a handler that invokes the reply callback
            await bus.addHandler('TestMessage', (_msg: any, _hdrs: any, _type: any, replyCallback: any) => {
                if (replyCallback) {
                    replyCallback('ReplyType', { CorrelationId: 'corr-1' });
                }
            });

            // Simulate consuming a message
            await consumeMessage(
                { CorrelationId: 'corr-1' },
                originalHeaders,
                'TestMessage'
            );

            // Original headers should not have ResponseMessageId set
            expect(originalHeaders.ResponseMessageId).to.be.undefined;
            expect(originalHeaders.RequestMessageId).to.equal(headersBefore.RequestMessageId);
        });
    });

    describe("isConnected", function(){

        var stub : any;
        beforeEach(function() {
            stub = sinon.stub(settingsObject.client.prototype, 'isConnected');
        });

        afterEach(function() {
            (settingsObject.client as any).prototype.isConnected.restore();
        });

        it("should return true if client is connected", async function(){
            stub.returns(true);

            let bus = new Bus({ amqpSettings: { queue:{name: "Test"} } });
            await bus.init();

            expect(await bus.isConnected()).to.be.true;
        });

        it("should return false if client is not connected", async function(){
            stub.returns(false);

            let bus = new Bus({ amqpSettings: { queue:{name: "Test"} } });
            await bus.init();

            expect(await bus.isConnected()).to.be.false;
        });

    });
});
