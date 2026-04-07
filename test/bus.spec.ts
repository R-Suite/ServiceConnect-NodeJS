
import { Bus } from '../src/index';
import chai from 'chai';
import sinon from 'sinon';
import settings from '../src/settings';
import { ValidationError } from '../src/errors/ValidationError';
import { ServiceConnectError } from '../src/errors/ServiceConnectError';

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
            expect(bus.config.amqpSettings.ssl?.verify).to.equal('verify_peer');
            expect(bus.config.amqpSettings.ssl?.key).to.be.undefined;
            expect(bus.config.amqpSettings.ssl?.cert).to.be.undefined;
            expect(bus.config.amqpSettings.ssl?.ca).to.be.undefined;
            expect(bus.config.amqpSettings.ssl?.pfx).to.be.undefined;
            expect(bus.config.amqpSettings.ssl?.passphrase).to.be.undefined;

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

    describe("consumeMessage after-filter error isolation", function() {
        var consumeTypeStub: any;

        beforeEach(function() {
            consumeTypeStub = sinon.stub(settingsObject.client.prototype, 'consumeType');
        });

        afterEach(function() {
            (settingsObject.client as any).prototype.consumeType.restore();
        });

        it("should not throw when after filter fails (handler already succeeded)", async function() {
            const failingAfterFilter = sinon.stub().rejects(new Error('After filter failed'));
            let bus = new Bus({
                amqpSettings: { queue: { name: 'Test' } },
                filters: { after: [failingAfterFilter], before: [], outgoing: [] }
            } as any);
            await bus.init();

            // Add a handler so the message is processed
            await bus.addHandler('TestType', () => {});

            const consumeMessage = (bus as any).consumeMessage.bind(bus);

            // Should not throw even though the after filter rejects
            await consumeMessage(
                { CorrelationId: 'abc' },
                { TypeName: 'TestType' },
                'TestType'
            );
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

    describe("createReplyCallback error handling", function() {
        var sendStub: any;
        var consumeTypeStub: any;

        beforeEach(function() {
            sendStub = sinon.stub(settingsObject.client.prototype, 'send').rejects(new Error('Send failed'));
            consumeTypeStub = sinon.stub(settingsObject.client.prototype, 'consumeType');
        });

        afterEach(function() {
            (settingsObject.client as any).prototype.send.restore();
            (settingsObject.client as any).prototype.consumeType.restore();
        });

        it("should catch errors in replyCallback internally", async function() {
            let bus = new Bus({ amqpSettings: { queue: { name: 'Test' } } });
            await bus.init();

            // Add a handler that invokes the reply callback
            await bus.addHandler('TestMessage', async (_msg: any, _hdrs: any, _type: any, replyCallback: any) => {
                if (replyCallback) {
                    await replyCallback('ReplyType', { CorrelationId: 'abc' });
                }
            });

            const consumeMessage = (bus as any).consumeMessage.bind(bus);

            // Should NOT throw even though send fails
            await consumeMessage(
                { CorrelationId: 'abc' },
                { SourceAddress: 'origin', RequestMessageId: '123' },
                'TestMessage'
            );
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

    describe("validation hardening", function() {

        it("should throw NOT_INITIALIZED when addHandler called before init", async function() {
            let bus = new Bus({ amqpSettings: { queue: { name: 'test' } } });
            try {
                await bus.addHandler('SomeType', () => {});
                assert.fail('should have thrown');
            } catch (err: any) {
                assert.strictEqual(err.code, 'NOT_INITIALIZED');
            }
        });

        it("should throw on send with empty type", async function() {
            let bus = new Bus({ amqpSettings: { queue: { name: 'test' } } } as any);
            (bus as any).initialized = true;
            (bus as any).core.client = { send: sinon.stub() };
            try {
                await bus.send('endpoint', '', { CorrelationId: 'a' } as any);
                assert.fail('should have thrown');
            } catch (err: any) {
                assert.strictEqual(err.code, 'INVALID_MESSAGE_TYPE');
            }
        });

        it("should throw on send with whitespace-only type", async function() {
            let bus = new Bus({ amqpSettings: { queue: { name: 'test' } } } as any);
            (bus as any).initialized = true;
            (bus as any).core.client = { send: sinon.stub() };
            try {
                await bus.send('endpoint', '   ', { CorrelationId: 'a' } as any);
                assert.fail('should have thrown');
            } catch (err: any) {
                assert.strictEqual(err.code, 'INVALID_MESSAGE_TYPE');
            }
        });

        it("should throw when maxRetries is NaN", function() {
            assert.throws(() => {
                new Bus({ amqpSettings: { queue: { name: 'test' }, maxRetries: NaN } } as any);
            });
        });

        it("should throw when maxRetries is Infinity", function() {
            assert.throws(() => {
                new Bus({ amqpSettings: { queue: { name: 'test' }, maxRetries: Infinity } } as any);
            });
        });

        it("should throw when retryDelay is NaN", function() {
            assert.throws(() => {
                new Bus({ amqpSettings: { queue: { name: 'test' }, retryDelay: NaN } } as any);
            });
        });

        it("should throw when prefetch is Infinity", function() {
            assert.throws(() => {
                new Bus({ amqpSettings: { queue: { name: 'test' }, prefetch: Infinity } } as any);
            });
        });

        it("should throw when prefetch is not an integer", function() {
            assert.throws(() => {
                new Bus({ amqpSettings: { queue: { name: 'test' }, prefetch: 1.5 } } as any);
            });
        });

        it("should throw when connectionMaxRetries is 0", function() {
            assert.throws(() => {
                new Bus({ amqpSettings: { queue: { name: 'test' }, connectionMaxRetries: 0 } } as any);
            });
        });

        it("should throw when connectionMaxRetries is NaN", function() {
            assert.throws(() => {
                new Bus({ amqpSettings: { queue: { name: 'test' }, connectionMaxRetries: NaN } } as any);
            });
        });

        it("should throw when queue name is whitespace-only", function() {
            assert.throws(() => {
                new Bus({ amqpSettings: { queue: { name: '   ' } } } as any);
            });
        });

        it("should throw when queue name is not a string", function() {
            assert.throws(() => {
                new Bus({ amqpSettings: { queue: { name: 123 } } } as any);
            });
        });

        it("should throw when host contains non-string", function() {
            assert.throws(() => {
                new Bus({ amqpSettings: { queue: { name: 'test' }, host: [123 as any] } } as any);
            });
        });

        it("should throw when host is a non-string value", function() {
            assert.throws(() => {
                new Bus({ amqpSettings: { queue: { name: 'test' }, host: 123 as any } } as any);
            });
        });

        it("should throw CONFIG_INVALID_SSL when SSL enabled without cert+key or pfx", function() {
            try {
                new Bus({ amqpSettings: { queue: { name: 'test' }, ssl: { enabled: true } } } as any);
                assert.fail('should have thrown');
            } catch (err: any) {
                assert.strictEqual(err.code, 'CONFIG_INVALID_SSL');
                assert.include(err.message, 'SSL is enabled but no certificate provided');
            }
        });

        it("should throw CONFIG_INVALID_SSL when SSL enabled with cert but no key", function() {
            try {
                new Bus({ amqpSettings: { queue: { name: 'test' }, ssl: { enabled: true, cert: Buffer.from('c') } } } as any);
                assert.fail('should have thrown');
            } catch (err: any) {
                assert.strictEqual(err.code, 'CONFIG_INVALID_SSL');
            }
        });

        it("should not throw when SSL enabled with cert+key", function() {
            assert.doesNotThrow(() => {
                new Bus({ amqpSettings: { queue: { name: 'test' }, ssl: { enabled: true, cert: Buffer.from('c'), key: Buffer.from('k') } } } as any);
            });
        });

        it("should not throw when SSL enabled with pfx", function() {
            assert.doesNotThrow(() => {
                new Bus({ amqpSettings: { queue: { name: 'test' }, ssl: { enabled: true, pfx: Buffer.from('p') } } } as any);
            });
        });

        it("should not throw when SSL is disabled without certificates", function() {
            assert.doesNotThrow(() => {
                new Bus({ amqpSettings: { queue: { name: 'test' }, ssl: { enabled: false } } } as any);
            });
        });

    });

    describe("CorrelationId validation", function() {

        var stub: any;
        beforeEach(function() {
            stub = sinon.stub(settingsObject.client.prototype, 'send');
        });

        afterEach(function() {
            (settingsObject.client as any).prototype.send.restore();
        });

        it("should throw when sending message without CorrelationId", async function() {
            let bus = new Bus({ amqpSettings: { queue: { name: 'test' } } } as any);
            await bus.init();
            try {
                await bus.send('endpoint', 'Type', {} as any);
                assert.fail('should have thrown');
            } catch (err: any) {
                assert.strictEqual(err.code, 'INVALID_MESSAGE_FORMAT');
                assert.include(err.message, 'CorrelationId');
            }
        });

        it("should throw when publishing message without CorrelationId", async function() {
            let publishStub = sinon.stub(settingsObject.client.prototype, 'publish');
            let bus = new Bus({ amqpSettings: { queue: { name: 'test' } } } as any);
            await bus.init();
            try {
                await bus.publish('Type', {} as any);
                assert.fail('should have thrown');
            } catch (err: any) {
                assert.strictEqual(err.code, 'INVALID_MESSAGE_FORMAT');
                assert.include(err.message, 'CorrelationId');
            } finally {
                publishStub.restore();
            }
        });

        it("should not throw when sending message with valid CorrelationId", async function() {
            let bus = new Bus({ amqpSettings: { queue: { name: 'test' } } } as any);
            await bus.init();
            await bus.send('endpoint', 'Type', { CorrelationId: 'abc' } as any);
            assert.isTrue(stub.calledOnce);
        });
    });

    describe("Error.captureStackTrace", function() {
        it("should fix Error.captureStackTrace to target correct constructor", function() {
            const err = new ValidationError('test', 'TEST_CODE', 'field');
            // The stack trace should not include 'new ServiceConnectError' since
            // new.target points to ValidationError, not ServiceConnectError
            assert.isFalse(err.stack?.includes('new ServiceConnectError'));
        });

        it("should produce correct stack for ServiceConnectError itself", function() {
            const err = new ServiceConnectError('test', 'CODE', false);
            assert.isDefined(err.stack);
            assert.include(err.stack!, 'test');
        });
    });
});
