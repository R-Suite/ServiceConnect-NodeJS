import 'babel-polyfill'
import { Bus } from '../src/index';
import chai from 'chai';
import sinon from 'sinon';
import settings from '../src/settings';

let expect = chai.expect;
let assert = chai.assert;

describe("Bus", function() {

    describe("Constructor", function() {

        it("should create build config", function() {
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
            bus.init();

            // Queue
            expect(bus.config.amqpSettings.queue.name).to.equal("ServiceConnectWebTest");
            expect(bus.config.amqpSettings.queue.durable).to.equal(true);
            expect(bus.config.amqpSettings.queue.exclusive).to.equal(false);
            expect(bus.config.amqpSettings.queue.autoDelete).to.equal(false);
            expect(bus.config.amqpSettings.queue.noAck).to.equal(false);

            // SSL
            expect(bus.config.amqpSettings.ssl.enabled).to.equal(false);
            expect(bus.config.amqpSettings.ssl.key).to.equal(null);
            expect(bus.config.amqpSettings.ssl.passphrase).to.equal(null);
            expect(bus.config.amqpSettings.ssl.cert).to.equal(null);
            expect(bus.config.amqpSettings.ssl.ca).to.be.a('Array');
            expect(bus.config.amqpSettings.ssl.ca).to.have.length(0);
            expect(bus.config.amqpSettings.ssl.pfx).to.equal(null);
            expect(bus.config.amqpSettings.ssl.fail_if_no_peer_cert).to.equal(false);
            expect(bus.config.amqpSettings.ssl.verify).to.equal('verify_peer');

            // Handlers
            expect(bus.config.handlers.LogCommand).to.be.a('Array');
            expect(bus.config.handlers.LogCommand).to.have.length(1);
            expect(bus.config.handlers.LogCommand[0]).to.be.a('function');

            // Other
            expect(bus.config.amqpSettings.host).to.equal("amqp://localhost");
            expect(bus.config.amqpSettings.retryDelay).to.equal(3000);
            expect(bus.config.amqpSettings.maxRetries).to.equal(3);
            expect(bus.config.amqpSettings.errorQueue).to.equal("errors");
            expect(bus.config.amqpSettings.auditQueue).to.equal("audit");
            expect(bus.config.amqpSettings.auditEnabled).to.equal(false);
        });
    });

    describe("init", function() {

        var connectStub;

        beforeEach(function(){
            connectStub = sinon.stub(settings.client.prototype, 'connect');
        });

        afterEach(function(){
            settings.client.prototype.connect.restore();
        });

        it("should create and connect to client", function() {
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
            bus.init();

            expect(bus.client).to.not.be.undefined;
            assert.isTrue(connectStub.called);
        });

        it("should bind connected event", function() {
            var connected = sinon.stub();

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
            bus.on("connected", connected);
            bus.init();
            bus.client.emit("connected");

            assert.isTrue(connected.called);
        });

        it("should call callback argument on connected", function() {
            var connected = sinon.stub();

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
            bus.init(connected);
            bus.client.emit("connected");

            assert.isTrue(connected.called);
        });

        it("should bind error event", function() {
            var error = sinon.stub();

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
            bus.on("error", error);
            bus.init();
            bus.client.emit("error", "error message");

            assert.isTrue(error.calledWith("error message"));
        });
    });

    describe("addHandler", function() {

        var connectStub;

        beforeEach(function(){
            connectStub = sinon.stub(settings.client.prototype, 'connect');
        });

        afterEach(function(){
            settings.client.prototype.connect.restore();
        });

        it("should create and connect to client", function() {
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
            bus.init();

            expect(bus.client).to.not.be.undefined;
            assert.isTrue(connectStub.called);
        });

    });

    describe("addHandler", function(){

        var consumeTypeStub;
        beforeEach(function(){
            sinon.stub(settings.client.prototype, 'connect');
            consumeTypeStub = sinon.stub(settings.client.prototype, 'consumeType');
        });

        afterEach(function(){
            settings.client.prototype.connect.restore();
            settings.client.prototype.consumeType.restore();
        });

        it("should call consumeType on client", function(){
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
            bus.init();

            bus.addHandler("Test.Message", () => {});

            assert.isTrue(consumeTypeStub.calledWith("TestMessage"));
        });

        it("should add the message type and callback to the handler map", function(){
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
            bus.init();
            var cb = () => {};
            bus.addHandler("Test.Message",cb );
            expect(bus.config.handlers["Test.Message"][0]).to.equal(cb);
        })
    });

    describe("removeHandler", function(){

        var removeTypeStub;
        beforeEach(function(){
            sinon.stub(settings.client.prototype, 'connect');
            removeTypeStub = sinon.stub(settings.client.prototype, 'removeType');
        });

        afterEach(function(){
            settings.client.prototype.connect.restore();
            settings.client.prototype.removeType.restore();
        });

        it("should remove handler mapping from handler dictionary", function(){
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
            bus.init();

            bus.removeHandler("Test.Message", cb);
            expect(bus.config.handlers["Test.Message"]).to.have.length(1);
            expect(bus.config.handlers["Test.Message"][0]).to.equal(cb2);
            expect(bus.config.handlers["Test.Message2"]).to.not.equal.undefined;
        });

        it("if all callbacks have been removed for a type then removeType should be called on client", function(){
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
            bus.init();

            bus.removeHandler("Test.Message",cb );
            assert.isTrue(removeTypeStub.calledWith("TestMessage"));
        });

        it("if all callbacks have not been removed for a message type then removeType should not be " +
           "called on the client", function(){

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
            bus.init();

            bus.removeHandler("Test.Message", cb);
            assert.isFalse(removeTypeStub.calledWith("TestMessage"));
        });

    });

    describe("isHandled", function(){

        beforeEach(function(){
            sinon.stub(settings.client.prototype, 'connect');
        });

        afterEach(function(){
            settings.client.prototype.connect.restore();
        });

        it("should return true if message type is mapped to a callback", function(){

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
            bus.init();

            var isHandled = bus.isHandled("LogCommand");

            expect(isHandled).to.equal.true;
        });

        it("should return false if message type is not mapped to a callback", function(){

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

            bus.init();

            var isHandled = bus.isHandled("LogCommand2");

            expect(isHandled).to.equal.false;
        });

        it("should return false if message type has 0 callbacks", function(){

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
            bus.init();

            var isHandled = bus.isHandled("LogCommand");

            expect(isHandled).to.equal.false;
        });

    });

    describe("send", function(){

        var stub;
        beforeEach(function() {
            sinon.stub(settings.client.prototype, 'connect');
            stub = sinon.stub(settings.client.prototype, 'send');
        });

        afterEach(function() {
            settings.client.prototype.connect.restore();
        });

        it("should send message to client", function(){
            let bus = new Bus(),
                endpoint = "TestEndpoint",
                type = "MessageType",
                message = {
                    data: "1234"
                },
                headers = { "Token": 1234567 };
            bus.init();

            bus.send(endpoint, type, message, headers);

            assert.isTrue(stub.calledWith(endpoint, type, message, headers));

            settings.client.prototype.send.restore();
        });

    });

    describe("publish", function(){

        var stub;
        beforeEach(function() {
            sinon.stub(settings.client.prototype, 'connect');
            stub = sinon.stub(settings.client.prototype, 'publish');
        });

        afterEach(function() {
            settings.client.prototype.connect.restore();
            settings.client.prototype.publish.restore();
        });

        it("should publish message to client", function(){
            let bus = new Bus(),
                type = "MessageType",
                message = {
                    data: "1234"
                },
                headers = { "Token": 1234567 };

            bus.init();
            bus.publish(type, message, headers);

            assert.isTrue(stub.calledWith(type, message, headers));
        });

    });

    describe("_consumeMessage", function(){

        beforeEach(function() {
            sinon.stub(settings.client.prototype, 'connect');
        });

        afterEach(function() {
            settings.client.prototype.connect.restore();
        });

        it("should process the correct message handlers", function(){

            var cb1 = sinon.stub(),
                cb2 = sinon.stub(),
                cb3 = sinon.stub(),
                message = {
                    data: "12345"
                },
                headers = { token: 123 },
                type = "LogCommand";

            let bus = new Bus({
                handlers: {
                    "LogCommand": [ cb1, cb2 ],
                    "LogCommand2": [ cb3 ]
                }
            });
            bus.init();

            bus._consumeMessage(message, headers, type);

            assert.isTrue(cb1.calledWith(message, headers, type));
            assert.isTrue(cb2.calledWith(message, headers, type));
            assert.isFalse(cb3.called);
        });

        it("should return success if there are no message handlers", function(){
            var message = {
                    data: "12345"
                },
                headers = { token: 123 },
                type = "LogCommand";

            let bus = new Bus();
            bus.init();

            var result = bus._consumeMessage(message, headers, type);

            expect(result.success).to.equal(true);
        });

        it("should return success after processing all message handlers", function(){
            var cb1 = sinon.stub(),
                cb2 = sinon.stub(),
                cb3 = sinon.stub(),
                message = {
                    data: "12345"
                },
                headers = { token: 123 },
                type = "LogCommand";

            let bus = new Bus({
                handlers: {
                    "LogCommand": [ cb1, cb2 ],
                    "LogCommand2": [ cb3 ]
                }
            });
            bus.init();

            var result = bus._consumeMessage(message, headers, type);

            expect(result.success).to.equal(true);
        });

        it("should return error if a handler throws an exception", function(){

            var cb1 = sinon.stub(),
                cb2 = sinon.stub(),
                cb3 = sinon.stub(),
                message = {
                    data: "12345"
                },
                headers = { token: 123 },
                type = "LogCommand";

            cb1.throws({
                error: "cb1 error"
            });

            let bus = new Bus({
                handlers: {
                    "LogCommand": [ cb1, cb2 ],
                    "LogCommand2": [ cb3 ]
                }
            });
            bus.init();

            var result = bus._consumeMessage(message, headers, type);

            console.log(result);
            expect(result.success).to.equal(false);
            expect(result.exception.error).to.equal("cb1 error");
        });

        it("if a handler throws an exception the error callback method should be called", function(){
            var cb1 = sinon.stub(),
                cb2 = sinon.stub(),
                cb3 = sinon.stub(),
                error = sinon.stub(),
                message = {
                    data: "12345"
                },
                headers = { token: 123 },
                type = "LogCommand";

            cb1.throws({
                error: "cb1 error"
            });

            let bus = new Bus({
                handlers: {
                    "LogCommand": [ cb1, cb2 ],
                    "LogCommand2": [ cb3 ]
                }
            });;
            bus.init();

            bus.on("error", error);

            bus._consumeMessage(message, headers, type);

            assert.isTrue(error.called);
        });
    });

    describe("close", function(){

        var stub;
        beforeEach(function() {
            sinon.stub(settings.client.prototype, 'connect');
            stub = sinon.stub(settings.client.prototype, 'close');
        });

        afterEach(function() {
            settings.client.prototype.connect.restore();
            settings.client.prototype.close.restore();
        });

        it("should close the client", function(){
            let bus = new Bus();
            bus.init();

            bus.close();

            assert.isTrue(stub.called);
        });

    });
});