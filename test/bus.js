
import { Bus } from '../src/index';
import chai from 'chai';
import sinon from 'sinon';
import settings from '../src/settings';

let expect = chai.expect;
let assert = chai.assert;

var settingsObject = settings();

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
            connectStub = sinon.stub(settingsObject.client.prototype, 'connect');
        });

        afterEach(function(){
            settingsObject.client.prototype.connect.restore();
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
            connectStub = sinon.stub(settingsObject.client.prototype, 'connect');
        });

        afterEach(function(){
            settingsObject.client.prototype.connect.restore();
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
            sinon.stub(settingsObject.client.prototype, 'connect');
            consumeTypeStub = sinon.stub(settingsObject.client.prototype, 'consumeType');
        });

        afterEach(function(){
            settingsObject.client.prototype.connect.restore();
            settingsObject.client.prototype.consumeType.restore();
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
        });

        it("* message type should not call consumeType on client", function(){
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

            bus.addHandler("*", () => {});

            assert.isFalse(consumeTypeStub.called);
        });

        it("should add * message type and callback to the handler map", function(){
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
            bus.addHandler("*",cb );
            expect(bus.config.handlers["*"][0]).to.equal(cb);
        });
    });

    describe("removeHandler", function(){

        var removeTypeStub;
        beforeEach(function(){
            sinon.stub(settingsObject.client.prototype, 'connect');
            removeTypeStub = sinon.stub(settingsObject.client.prototype, 'removeType');
        });

        afterEach(function(){
            settingsObject.client.prototype.connect.restore();
            settingsObject.client.prototype.removeType.restore();
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
            sinon.stub(settingsObject.client.prototype, 'connect');
        });

        afterEach(function(){
            settingsObject.client.prototype.connect.restore();
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
            sinon.stub(settingsObject.client.prototype, 'connect');
            stub = sinon.stub(settingsObject.client.prototype, 'send');
        });

        afterEach(function() {
            settingsObject.client.prototype.connect.restore();
        });

        it("should send message to client", async () => {
            let bus = new Bus(),
                endpoint = "TestEndpoint",
                type = "MessageType",
                message = {
                    data: "1234"
                },
                headers = { "Token": 1234567 };
            bus.init();

            await bus.send(endpoint, type, message, headers);

            assert.isTrue(stub.calledWith(endpoint, type, message, headers));

            settingsObject.client.prototype.send.restore();
        });

    });

    describe("publish", function(){

        var stub;
        beforeEach(function() {
            sinon.stub(settingsObject.client.prototype, 'connect');
            stub = sinon.stub(settingsObject.client.prototype, 'publish');
        });

        afterEach(function() {
            settingsObject.client.prototype.connect.restore();
            settingsObject.client.prototype.publish.restore();
        });

        it("should publish message to client", async () => {
            let bus = new Bus(),
                type = "MessageType",
                message = {
                    data: "1234"
                },
                headers = { "Token": 1234567 };

            bus.init();
            await bus.publish(type, message, headers);

            assert.isTrue(stub.calledWith(type, message, headers));
        });

    });

    describe("sendRequest", function(){

        var stub;
        beforeEach(function() {
            sinon.stub(settingsObject.client.prototype, 'connect');
            stub = sinon.stub(settingsObject.client.prototype, 'send');
        });

        afterEach(function() {
            settingsObject.client.prototype.connect.restore();
            settingsObject.client.prototype.send.restore();
        });

        it("should send message to client", async () => {
            let bus = new Bus(),
                endpoint = "TestEndpoint",
                type = "MessageType",
                message = {
                    data: "1234"
                },
                headers = { "Token": 1234567 },
                callback = ()=> {};
            bus.init();

            await bus.sendRequest(endpoint, type, message, callback, headers);

            assert.isTrue(stub.calledWith(endpoint, type, message, sinon.match({
                "Token": 1234567,
                "RequestMessageId": Object.keys(bus.requestReplyCallbacks)[0]
            })));
        });

        it("should add request to callback dictionary", async () => {
            let bus = new Bus(),
                endpoint = "TestEndpoint",
                type = "MessageType",
                message = {
                    data: "1234"
                },
                headers = { "Token": 1234567 },
                callback = () => {};
            bus.init();
            await bus.sendRequest(endpoint, type, message, callback, headers);

            console.log(bus.requestReplyCallbacks)

            expect(bus.requestReplyCallbacks[headers["RequestMessageId"]].endpointCount).to.equal(1);
            expect(bus.requestReplyCallbacks[headers["RequestMessageId"]].processedCount).to.equal(0);
            expect(bus.requestReplyCallbacks[headers["RequestMessageId"]].callback).to.equal(callback);
        });

        it("expected replies should be equal to number of endpoints passed into sendRequest", async () => {
            let bus = new Bus(),
                endpoints = ["TestEndpoint1", "TestEndpoint2"],
                type = "MessageType",
                message = {
                    data: "1234"
                },
                headers = { "Token": 1234567 },
                callback = () => {};
            bus.init();
            await bus.sendRequest(endpoints, type, message, callback, headers);

            expect(bus.requestReplyCallbacks[headers["RequestMessageId"]].endpointCount).to.equal(2);
        });

    });

    describe("publishRequest", function(){

        var stub, sendStub;
        beforeEach(function() {
            sinon.stub(settingsObject.client.prototype, 'connect');
            stub = sinon.stub(settingsObject.client.prototype, 'publish');
            sendStub = sinon.stub(settingsObject.client.prototype, 'send');
        });

        afterEach(function() {
            settingsObject.client.prototype.connect.restore();
            settingsObject.client.prototype.publish.restore();
            settingsObject.client.prototype.send.restore();
        });

        it("should publish message to client", async () => {
            let bus = new Bus(),
                type = "MessageType",
                message = {
                    data: "1234"
                },
                headers = { "Token": 1234567 },
                callback = sinon.stub();

            bus.init();
            await bus.publishRequest(type, message, callback, 1, null, headers);

            assert.isTrue(!callback.called);
            assert.isTrue(stub.calledWith(type, message, headers));
        });

        it("should add request configuration", async () => {
            let bus = new Bus(),
                type = "MessageType",
                message = {
                    data: "1234"
                },
                headers = { "Token": 1234567 },
                callback = sinon.stub();

            bus.init();
            await bus.publishRequest(type, message, callback, 1, null, headers);

            expect(bus.requestReplyCallbacks[headers["RequestMessageId"]].processedCount).to.equal(0);
            expect(bus.requestReplyCallbacks[headers["RequestMessageId"]].callback).to.equal(callback);
        });

        it("should remove request configuration after timeout", function(done){
            let bus = new Bus(),
                type = "MessageType",
                message = {
                    data: "1234"
                },
                headers = { },
                count = 0;

            bus.init();
            bus.publishRequest(type, message, () => {}, null, 1);

            var timeout = setTimeout(function(){
                if (bus.requestReplyCallbacks[headers["RequestMessageId"]] === undefined) {
                    assert(true);
                    done();
                } else {
                    clearTimeout(timeout);
                    assert(false);
                    done();
                }
                count++;
            }, 2);
        });

        it("should set expected replies", async () => {
            let bus = new Bus(),
                type = "MessageType",
                message = {
                    data: "1234"
                },
                headers = { };

            bus.init();
            await bus.publishRequest(type, message, () => {}, 2, null, headers);

            expect(bus.requestReplyCallbacks[headers["RequestMessageId"]].endpointCount).to.equal(2);
        });

    });

    describe("_consumeMessage", function(){

        beforeEach(function() {
            sinon.stub(settingsObject.client.prototype, 'connect');
        });

        afterEach(function() {
            settingsObject.client.prototype.connect.restore();
        });

        it("should process the correct message handlers", function(done){
            var cb1 = sinon.stub(),
                cb2 = sinon.stub(),
                cb3 = sinon.stub(),
                cb4 = sinon.stub(),
                message = {
                    data: "12345"
                },
                headers = { token: 123 },
                type = "LogCommand";

            let bus = new Bus({
                handlers: {
                    "LogCommand": [ cb1, cb2 ],
                    "LogCommand2": [ cb3 ],
                    "*": [ cb4 ]
                }
            });
            bus.init();

            bus._consumeMessage(message, headers, type)
              .then(r => {
                assert.isTrue(cb1.calledWith(message, headers, type));
                assert.isTrue(cb2.calledWith(message, headers, type));
                assert.isFalse(cb3.called);
                assert.isTrue(cb4.calledWith(message, headers, type));
                done();
              })
              .catch(e => {
                assert(false);
                done();
              });
        });

        it("should process the correct message handlers after processing filters", function(done){
            var cb1 = sinon.stub(),
                cb2 = sinon.stub(),
                cb3 = sinon.stub(),
                cb4 = sinon.stub(),
                message = {
                    data: "12345"
                },
                headers = { token: 123 },
                type = "LogCommand";

            let beforeFilters = [
              () => true,
              () => new Promise((r,_) => r(true))
            ];

            let bus = new Bus({
                handlers: {
                    "LogCommand": [ cb1, cb2 ],
                    "LogCommand2": [ cb3 ],
                    "*": [ cb4 ]
                },
                filters: {
                  before: beforeFilters
                }
            });
            bus.init();

            bus._consumeMessage(message, headers, type)
              .then(r => {
                assert.isTrue(cb1.calledWith(message, headers, type));
                assert.isTrue(cb2.calledWith(message, headers, type));
                assert.isFalse(cb3.called);
                assert.isTrue(cb4.calledWith(message, headers, type));
                done();
              })
              .catch(e => {
                assert(false);
                done();
              });
        });

        it("should not process any message handlers if before filters return false", function(done){
            var cb1 = sinon.stub(),
                cb2 = sinon.stub(),
                cb3 = sinon.stub(),
                cb4 = sinon.stub(),
                message = {
                    data: "12345"
                },
                headers = { token: 123 },
                type = "LogCommand";

            let beforeFilters = [
              () => false,
              () => new Promise((r,_) => r(true))
            ];

            let bus = new Bus({
                handlers: {
                    "LogCommand": [ cb1, cb2 ],
                    "LogCommand2": [ cb3 ],
                    "*": [ cb4 ]
                },
                filters: {
                  before: beforeFilters
                }
            });
            bus.init();

            bus._consumeMessage(message, headers, type)
              .then(r => {
                assert(false);
                done();
              })
              .catch(e => {
                assert.isFalse(cb1.called);
                assert.isFalse(cb2.called);
                assert.isFalse(cb3.called);
                assert.isFalse(cb4.called);
                done();
              });
        });

        it("should not process any message handlers if before filters return a promise that resolves to false", function(done){
            var cb1 = sinon.stub(),
                cb2 = sinon.stub(),
                cb3 = sinon.stub(),
                cb4 = sinon.stub(),
                message = {
                    data: "12345"
                },
                headers = { token: 123 },
                type = "LogCommand";

            let beforeFilters = [
              () => true,
              () => new Promise((r,_) => r(false))
            ];

            let bus = new Bus({
                handlers: {
                    "LogCommand": [ cb1, cb2 ],
                    "LogCommand2": [ cb3 ],
                    "*": [ cb4 ]
                },
                filters: {
                  before: beforeFilters
                }
            });
            bus.init();

            bus._consumeMessage(message, headers, type)
              .then(r => {
                assert(false);
                done();
              })
              .catch(e => {
                assert.isFalse(cb1.called);
                assert.isFalse(cb2.called);
                assert.isFalse(cb3.called);
                assert.isFalse(cb4.called);
                done();
              });
        });

        it("should not process any message handlers if before filter throws exception", function(done){
            var cb1 = sinon.stub(),
                cb2 = sinon.stub(),
                cb3 = sinon.stub(),
                cb4 = sinon.stub(),
                message = {
                    data: "12345"
                },
                headers = { token: 123 },
                type = "LogCommand";

            let beforeFilters = [
              () => true,
              () =>  { throw "Error"; }
            ];

            let bus = new Bus({
                handlers: {
                    "LogCommand": [ cb1, cb2 ],
                    "LogCommand2": [ cb3 ],
                    "*": [ cb4 ]
                },
                filters: {
                  before: beforeFilters
                }
            });
            bus.init();

            bus._consumeMessage(message, headers, type)
              .then(r => {
                assert(false);
                done();
              })
              .catch(e => {
                assert.isFalse(cb1.called);
                assert.isFalse(cb2.called);
                assert.isFalse(cb3.called);
                assert.isFalse(cb4.called);
                done();
              });
        });

        it("should not process any message handlers if before filter returns a promise that is rejected", function(done){
            var cb1 = sinon.stub(),
                cb2 = sinon.stub(),
                cb3 = sinon.stub(),
                cb4 = sinon.stub(),
                message = {
                    data: "12345"
                },
                headers = { token: 123 },
                type = "LogCommand";

            let beforeFilters = [
              () => true,
              () => new Promise((_, r) => r())
            ];

            let bus = new Bus({
                handlers: {
                    "LogCommand": [ cb1, cb2 ],
                    "LogCommand2": [ cb3 ],
                    "*": [ cb4 ]
                },
                filters: {
                  before: beforeFilters
                }
            });
            bus.init();

            bus._consumeMessage(message, headers, type)
              .then(r => {
                assert(false);
                done();
              })
              .catch(e => {
                assert.isFalse(cb1.called);
                assert.isFalse(cb2.called);
                assert.isFalse(cb3.called);
                assert.isFalse(cb4.called);
                done();
              });
        });

        it("should process before and after filters in order", function(done){
            var cb1 = sinon.stub(),
                message = {
                    data: "12345"
                },
                headers = { token: 123 },
                type = "LogCommand";

            let beforeCalls = [];
            let beforeFilters = [
              () => beforeCalls.push(1),
              () => beforeCalls.push(2),
              () => beforeCalls.push(3),
              () => beforeCalls.push(4),
            ];

            let afterCalls = [];
            let afterFilters= [
              () => afterCalls.push(1),
              () => afterCalls.push(2),
              () => afterCalls.push(3),
              () => afterCalls.push(4),
            ];

            let bus = new Bus({
                handlers: {
                    "LogCommand": [ cb1 ],
                },
                filters: {
                  before: beforeFilters,
                  after: afterFilters
                }
            });
            bus.init();

            bus._consumeMessage(message, headers, type)
              .then(r => {
                expect(beforeCalls).to.deep.equal([
                    1,
                    2,
                    3,
                    4
                ]);
                expect(afterCalls).to.deep.equal([
                    1,
                    2,
                    3,
                    4
                ]);
                done();
              })
              .catch(e => {
                assert(false);
                done();
              });
        });

        it("should successfully resolve promise if there are no message handlers", function(done){
            var message = {
                    data: "12345"
                },
                headers = { token: 123 },
                type = "LogCommand";

            let bus = new Bus();
            bus.init();

            var result = bus._consumeMessage(message, headers, type);

            result.then(() => {
              assert(true);
              done();
            }).catch(() => {
              assert(false);
              done();
            });
        });

        it("should successfully resolve promise after processing all message handlers", function(done){
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

            result.then(() => {
              assert(true);
              done();
            }).catch(() => {
              console.log(`error ${i}`);
              assert(false);
              done();
            });
        });

        it("should successfully resolve promise after processing handlers that return promises", done => {
            var cb1 = sinon.stub().returns(new Promise((res, _) => res())),
                cb2 = sinon.stub().returns(new Promise((res, _) => res())),
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

            result.then(() => {
              assert(true);
              done();
            }).catch(() => {
              console.log(`error ${i}`);
              assert(false);
              done();
            });
        });

        it("reply callback should send message to source address", function(done){

            var stub1 = sinon.stub(settingsObject.client.prototype, 'send');

            var replyMessage = {message: 123},
                cb1 = (message, headers, type, replyCallback) => {
                    replyCallback("TestReply", replyMessage);
                },
                message = {
                    data: "12345"
                },
                headers = { token: 123, SourceAddress: "Source" },
                type = "LogCommand";

            let bus = new Bus({
                handlers: {
                    "LogCommand": [ cb1 ]
                }
            });
            bus.init();

            bus._consumeMessage(message, headers, type)
              .then(r => {
                assert.isTrue(stub1.calledWith("Source", "TestReply", replyMessage, headers));
                settingsObject.client.prototype.send.restore();
                done();
              })
              .catch(e => {
                assert(false);
                done();
              });

        });

        it("should throw error if a handler throws an exception", function(done){

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

            bus._consumeMessage(message, headers, type)
              .then(r => {
                assert(false);
                done();
              })
              .catch(e => {
                assert(true);
                done();
              });
        });

        it("should throw error if a handler returns a rejected promise", function(done){

            var cb1 = sinon.stub().returns(new Promise((_, rej) => rej())),
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

            bus._consumeMessage(message, headers, type)
              .then(r => {
                assert(false);
                done();
              })
              .catch(e => {
                assert(true);
                done();
              });
        });

        it("if a handler throws an exception the error callback method should be called", function(done){
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
            });
            bus.init();

            bus.on("error", error);

            bus._consumeMessage(message, headers, type)
              .then(_ => {
                assert(false);
                done();
              })
              .catch(e => {
                assert.isTrue(error.called);
                done();
              });

        });
    });

    describe("close", function(){

        var stub;
        beforeEach(function() {
            sinon.stub(settingsObject.client.prototype, 'connect');
            stub = sinon.stub(settingsObject.client.prototype, 'close');
        });

        afterEach(function() {
            settingsObject.client.prototype.connect.restore();
            settingsObject.client.prototype.close.restore();
        });

        it("should close the client", function(){
            let bus = new Bus();
            bus.init();

            bus.close();

            assert.isTrue(stub.called);
        });

    });
});
