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

        it("should create and connect to client", function() {
            var stub = sinon.stub(settings.client.prototype, 'connect');

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

            expect(bus.client).to.not.be.undefined;
            assert.isTrue(stub.called);

            settings.client.prototype.connect.restore();
        });

    });

    describe("on", function(){

        afterEach(function(){
            settings.client.prototype.connect.restore();
            settings.client.prototype.consumeType.restore();
        });

        it("should call consumeType on client", function(){
            sinon.stub(settings.client.prototype, 'connect');
            var stub = sinon.stub(settings.client.prototype, 'consumeType');

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

            bus.on("Test.Message", () => {});

            assert.isTrue(stub.calledWith("TestMessage"));
        });

        it("should add the message type and callback to the handler map", function(){
            sinon.stub(settings.client.prototype, 'connect');
            sinon.stub(settings.client.prototype, 'consumeType');

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
            var cb = () => {};
            bus.on("Test.Message",cb );
            expect(bus.config.handlers["Test.Message"][0]).to.equal(cb);
        })
    });

    describe("off", function(){

        afterEach(function(){
            settings.client.prototype.connect.restore();
            settings.client.prototype.removeType.restore();
        });

        it("should remove handler mapping from handler dictionary", function(){
            sinon.stub(settings.client.prototype, 'connect');
            sinon.stub(settings.client.prototype, 'removeType');

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

            bus.off("Test.Message", cb);
            expect(bus.config.handlers["Test.Message"]).to.have.length(1);
            expect(bus.config.handlers["Test.Message"][0]).to.equal(cb2);
            expect(bus.config.handlers["Test.Message2"]).to.not.equal.undefined;
        });

        it("if all callbacks have been removed for a type then removeType should be called on client", function(){
            sinon.stub(settings.client.prototype, 'connect');
            var stub = sinon.stub(settings.client.prototype, 'removeType');

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

            bus.off("Test.Message",cb );
            assert.isTrue(stub.calledWith("TestMessage"));
        });

        it("if all callbacks have not been removed for a message type then removeType should not be " +
           "called on the client", function(){
            sinon.stub(settings.client.prototype, 'connect');
            var stub = sinon.stub(settings.client.prototype, 'removeType');

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

            bus.off("Test.Message", cb);
            assert.isFalse(stub.calledWith("TestMessage"));
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

            var isHandled = bus.isHandled("LogCommand");

            expect(isHandled).to.equal.false;
        });

    });

    describe("send", function(){

        beforeEach(function() {
            sinon.stub(settings.client.prototype, 'connect');
        });

        afterEach(function() {
            settings.client.prototype.connect.restore();
        });

        it("should send message to client", function(){
            var stub = sinon.stub(settings.client.prototype, 'send');
            let bus = new Bus(),
                endpoint = "TestEndpoint",
                type = "MessageType",
                message = {
                    data: "1234"
                },
                headers = { "Token": 1234567 };

            bus.send(endpoint, type, message, headers);

            assert.isTrue(stub.calledWith(endpoint, type, message, headers));

            settings.client.prototype.send.restore();
        });

    });

    describe("publish", function(){

        beforeEach(function() {
            sinon.stub(settings.client.prototype, 'connect');
        });

        afterEach(function() {
            settings.client.prototype.connect.restore();
        });

        it("should publish message to client", function(){
            var stub = sinon.stub(settings.client.prototype, 'publish');
            let bus = new Bus(),
                type = "MessageType",
                message = {
                    data: "1234"
                },
                headers = { "Token": 1234567 };

            bus.publish(type, message, headers);

            assert.isTrue(stub.calledWith(type, message, headers));

            settings.client.prototype.publish.restore();
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

            var result = bus._consumeMessage(message, headers, type);

            expect(result.success).to.equal(true);
        });

        it("should return error a handler throws an exception", function(){

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

            var result = bus._consumeMessage(message, headers, type);

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
                },
                events: {
                    error: error
                }
            });

            bus._consumeMessage(message, headers, type);

            assert.isTrue(error.called);
        });
    });

    describe("close", function(){

        beforeEach(function() {
            sinon.stub(settings.client.prototype, 'connect');
        });

        afterEach(function() {
            settings.client.prototype.connect.restore();
        });

        it("should close the client", function(){
            var stub = sinon.stub(settings.client.prototype, 'close');
            let bus = new Bus();

            bus.close();

            assert.isTrue(stub.called);

            settings.client.prototype.close.restore();
        });

    });
});