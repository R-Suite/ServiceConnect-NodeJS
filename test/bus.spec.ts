
import { Bus } from '../src/index';
import chai from 'chai';
import sinon from 'sinon';
import settings from '../src/settings';
import { IBus, IClient } from '../src/types';
import Sinon from 'sinon';

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
     
        it("should create and connect to client", async function() {
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

            expect(bus.client).to.not.be.undefined;
            assert.isTrue(connectStub.called);
        });        
    });

    describe("addHandler", function() {
     

        it("should create and connect to client", async function() {
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

            expect(bus.client).to.not.be.undefined;
            assert.isTrue(connectStub.called);
        });

        it("adding handler before init should not throw", async function() {
            let bus = new Bus({
                amqpSettings: {
                    queue: {
                        name: 'ServiceConnectWebTest'
                    }
                }
            });
            await bus.addHandler("LogCommand", console.log);
            expect(bus.config.handlers["LogCommand"][0]).to.equal(console.log);
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

        it("should add the message type and callback to the handler map", async function(){
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
            await bus.addHandler("Test.Message",cb );
            expect(bus.config.handlers["Test.Message"][0]).to.equal(cb);
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

        it("should add * message type and callback to the handler map", async function(){
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
            expect(bus.config.handlers["*"][0]).to.equal(cb);
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
            expect(bus.config.handlers["Test.Message"]).to.have.length(1);
            expect(bus.config.handlers["Test.Message"][0]).to.equal(cb2);
            expect(bus.config.handlers["Test.Message2"]).to.not.be.undefined;
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

            (settingsObject.client as any).prototype.send.restore();
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
                "RequestMessageId": Object.keys(bus.requestReplyCallbacks)[0]
            })));
        });

        it("should add request to callback dictionary", async () => {
            let bus = new Bus({ amqpSettings: { queue:{name: "Test"} } }),
                endpoint = "TestEndpoint",
                type = "MessageType",
                message : any = {
                    CorrelationId: "abc",
                    data: "1234"
                },
                headers : any= { "Token": 1234567 },
                callback = () => {};
            await bus.init();
            await bus.sendRequest(endpoint, type, message, callback, headers);

            console.log(bus.requestReplyCallbacks)

            expect(bus.requestReplyCallbacks[headers["RequestMessageId"]].endpointCount).to.equal(1);
            expect(bus.requestReplyCallbacks[headers["RequestMessageId"]].processedCount).to.equal(0);
            expect(bus.requestReplyCallbacks[headers["RequestMessageId"]].callback).to.equal(callback);
        });

        it("expected replies should be equal to number of endpoints passed into sendRequest", async () => {
            let bus = new Bus({ amqpSettings: { queue:{name: "Test"} } }),
                endpoints = ["TestEndpoint1", "TestEndpoint2"],
                type = "MessageType",
                message = {
                    CorrelationId: "abc",
                    data: "1234"
                },
                headers : any = { "Token": 1234567 },
                callback = () => {};
            await bus.init();
            await bus.sendRequest(endpoints, type, message, callback, headers);

            expect(bus.requestReplyCallbacks[headers["RequestMessageId"]].endpointCount).to.equal(2);
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
            assert.isTrue(stub.calledWith(type, message, headers));
        });

        it("should add request configuration", async () => {
            let bus = new Bus({ amqpSettings: { queue:{name: "Test"} } }),
                type = "MessageType",
                message : any = {
                    CorrelationId: "abc",
                    data: "1234"
                },
                headers : any = { "Token": 1234567 },
                callback = sinon.stub();

            await bus.init();
            await bus.publishRequest(type, message, callback, 1, null, headers);

            expect(bus.requestReplyCallbacks[headers["RequestMessageId"]].processedCount).to.equal(0);
            expect(bus.requestReplyCallbacks[headers["RequestMessageId"]].callback).to.equal(callback);
        });

        it("should remove request configuration after timeout", async function(){
            let bus = new Bus({ amqpSettings: { queue:{name: "Test"} } }),
                type = "MessageType",
                message = {
                    CorrelationId: "abc",
                    data: "1234"
                },
                headers : any = { },
                count = 0;

            await bus.init();
            bus.publishRequest(type, message, () => {}, null, 1);

            return new Promise<void>((resolve, reject) => {
                var timeout = setTimeout(function(){
                    if (bus.requestReplyCallbacks[headers["RequestMessageId"]] === undefined) {
                        assert(true);
                        resolve();
                    } else {
                        clearTimeout(timeout);
                        assert(false);
                        reject();
                    }
                    count++;
                }, 2);
            });            
        });

        it("should set expected replies", async () => {
            let bus = new Bus({ amqpSettings: { queue:{name: "Test"} } }),
                type = "MessageType",
                message = {
                    CorrelationId: "abc",
                    data: "1234"
                },
                headers : any = { };

            await bus.init();
            await bus.publishRequest(type, message, () => {}, 2, null, headers);

            expect(bus.requestReplyCallbacks[headers["RequestMessageId"]].endpointCount).to.equal(2);
        });

    });

    describe("_consumeMessage", function(){

        it("should process the correct message handlers", async function(){
            var cb1 = sinon.stub(),
                cb2 = sinon.stub(),
                cb3 = sinon.stub(),
                cb4 = sinon.stub(),
                message = {
                    CorrelationId: "abc",
                    data: "12345"
                },
                headers = { token: 123 },
                type = "LogCommand";

            let bus = new Bus({
                amqpSettings: {
                    queue:{name: "Test"}
                },
                handlers: {
                    "LogCommand": [ cb1, cb2 ],
                    "LogCommand2": [ cb3 ],
                    "*": [ cb4 ]
                }
            });
            await bus.init();

            
            return new Promise<void>((resolve, reject) => {
                bus._consumeMessage(message, headers, type)
                .then(r => {
                    assert.isTrue(cb1.calledWith(message, headers, type));
                    assert.isTrue(cb2.calledWith(message, headers, type));
                    assert.isFalse(cb3.called);
                    assert.isTrue(cb4.calledWith(message, headers, type));
                    resolve();
                })
                .catch(e => {
                    assert(false);
                    reject();
                });
            })
            
        });

        it("should process the correct message handlers after processing filters", async function(){
            var cb1 = sinon.stub(),
                cb2 = sinon.stub(),
                cb3 = sinon.stub(),
                cb4 = sinon.stub(),
                message = {
                    CorrelationId: "abc",
                    data: "12345"
                },
                headers = { token: 123 },
                type = "LogCommand";

            let beforeFilters = [
              (m : any) => true,
              (m : any) => new Promise<boolean>((r,_) => r(true))
            ];

            let bus = new Bus({
                amqpSettings: { queue:{name: "Test"} },
                handlers: {
                    "LogCommand": [ cb1, cb2 ],
                    "LogCommand2": [ cb3 ],
                    "*": [ cb4 ]
                },
                filters: {
                  before: beforeFilters
                }
            });
            await bus.init();

            return new Promise<void>((resolve, reject) => {
                bus._consumeMessage(message, headers, type)
                .then(r => {
                    assert.isTrue(cb1.calledWith(message, headers, type));
                    assert.isTrue(cb2.calledWith(message, headers, type));
                    assert.isFalse(cb3.called);
                    assert.isTrue(cb4.calledWith(message, headers, type));
                    resolve();
                })
                .catch(e => {
                    assert(false);
                    reject();
                });
            });
            
        });

        it("should not process any message handlers if before filters return false", async function(){
            var cb1 = sinon.stub(),
                cb2 = sinon.stub(),
                cb3 = sinon.stub(),
                cb4 = sinon.stub(),
                message = {
                    CorrelationId: "abc",
                    data: "12345"
                },
                headers = { token: 123 },
                type = "LogCommand";

            let beforeFilters = [
              () => false,
              () => new Promise<boolean>((r,_) => r(true))
            ];

            let bus = new Bus({
                amqpSettings: { queue:{name: "Test"} },
                handlers: {
                    "LogCommand": [ cb1, cb2 ],
                    "LogCommand2": [ cb3 ],
                    "*": [ cb4 ]
                },
                filters: {
                  before: beforeFilters
                }
            });
            await bus.init();

            return new Promise<void>((resolve, reject) => {
                bus._consumeMessage(message, headers, type)
                .then(r => {
                    assert.isFalse(cb1.called, "cb1");
                    assert.isFalse(cb2.called, "cb2");
                    assert.isFalse(cb3.called, "cb3");
                    assert.isFalse(cb4.called, "cb4");
                    resolve();
                })
                .catch(e => {
                    reject(e);
                });
            });
            
        });

        it("should not process any message handlers if before filters return a promise that resolves to false", async function(){
            var cb1 = sinon.stub(),
                cb2 = sinon.stub(),
                cb3 = sinon.stub(),
                cb4 = sinon.stub(),
                message = {
                    CorrelationId: "abc",
                    data: "12345"
                },
                headers = { token: 123 },
                type = "LogCommand";

            let beforeFilters = [
              () => true,
              () => new Promise<boolean>((r,_) => r(false))
            ];

            let bus = new Bus({
                amqpSettings: { queue:{name: "Test"} },
                handlers: {
                    "LogCommand": [ cb1, cb2 ],
                    "LogCommand2": [ cb3 ],
                    "*": [ cb4 ]
                },
                filters: {
                  before: beforeFilters
                }
            });
            await bus.init();

            return new Promise<void>((resolve, reject) => {
                bus._consumeMessage(message, headers, type)
                .then(r => {                    
                    assert.isFalse(cb1.called);
                    assert.isFalse(cb2.called);
                    assert.isFalse(cb3.called);
                    assert.isFalse(cb4.called);
                    resolve();
                })
                .catch(e => {
                    reject(e)
                });
            });
            
        });

        it("should not process any message handlers if before filter throws exception", async function(){
            var cb1 = sinon.stub(),
                cb2 = sinon.stub(),
                cb3 = sinon.stub(),
                cb4 = sinon.stub(),
                message = {
                    CorrelationId: "abc",
                    data: "12345"
                },
                headers = { token: 123 },
                type = "LogCommand";

            let beforeFilters = [
              () => true,
              () =>  { throw "Error"; }
            ];

            let bus = new Bus({
                amqpSettings: { queue:{name: "Test"} },
                handlers: {
                    "LogCommand": [ cb1, cb2 ],
                    "LogCommand2": [ cb3 ],
                    "*": [ cb4 ]
                },
                filters: {
                  before: beforeFilters
                }
            });
            await bus.init();

            return new Promise<void>((resolve, reject) => {
                bus._consumeMessage(message, headers, type)
                .then(r => {
                    assert(false);
                    reject("Should throw an exception")
                })
                .catch(e => {
                    assert.isFalse(cb1.called);
                    assert.isFalse(cb2.called);
                    assert.isFalse(cb3.called);
                    assert.isFalse(cb4.called);
                    resolve()
                });
            });
            
        });

        it("should not process any message handlers if before filter returns a promise that is rejected", async function(){
            var cb1 = sinon.stub(),
                cb2 = sinon.stub(),
                cb3 = sinon.stub(),
                cb4 = sinon.stub(),
                message = {
                    CorrelationId: "abc",
                    data: "12345"
                },
                headers = { token: 123 },
                type = "LogCommand";

            let beforeFilters = [
              () => true,
              () => new Promise<boolean>((_, r) => r())
            ];

            let bus = new Bus({
                amqpSettings: { queue:{name: "Test"} },
                handlers: {
                    "LogCommand": [ cb1, cb2 ],
                    "LogCommand2": [ cb3 ],
                    "*": [ cb4 ]
                },
                filters: {
                  before: beforeFilters
                }
            });
            await bus.init();

            return new Promise<void>((resolve, reject) => {
                bus._consumeMessage(message, headers, type)
                .then(r => {
                    assert(false);
                    reject("Should throw an exception")
                })
                .catch(e => {
                    assert.isFalse(cb1.called);
                    assert.isFalse(cb2.called);
                    assert.isFalse(cb3.called);
                    assert.isFalse(cb4.called);
                    resolve()
                });
            });
            
        });

        it("should process before and after filters in order", async function(){
            var cb1 = sinon.stub(),
                message  : any= {
                    CorrelationId: "abc",
                    data: "12345"
                },
                headers : any = { token: 123 },
                type = "LogCommand";

            let beforeCalls : any = [];
            let beforeFilters : any = [
              () => !!beforeCalls.push(1),
              () => !!beforeCalls.push(2),
              () => !!beforeCalls.push(3),
              () => !!beforeCalls.push(4),
            ];

            let afterCalls : any = [];
            let afterFilters : any= [
              () => !!afterCalls.push(1),
              () => !!afterCalls.push(2),
              () => !!afterCalls.push(3),
              () => !!afterCalls.push(4),
            ];

            let bus = new Bus({
                amqpSettings: { queue:{name: "Test"} },
                handlers: {
                    "LogCommand": [ cb1 ],
                },
                filters: {
                  before: beforeFilters,
                  after: afterFilters
                }
            });
            await bus.init();

            return new Promise<void>((resolve, reject) => {
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
                    resolve()
                })
                .catch(e => {
                    assert(false);
                    reject()
                });
            });
            
        });

        it("should successfully resolve promise if there are no message handlers", async function(){
            var message = {
                    CorrelationId: "abc",
                    data: "12345"
                },
                headers = { token: 123 },
                type = "LogCommand";

            let bus = new Bus({ amqpSettings: { queue:{name: "Test"} } });
            await bus.init();

            var result = bus._consumeMessage(message, headers, type);

            return new Promise<void>((resolve, reject) => {
                result.then(() => {
                    assert(true);
                    resolve()
                  }).catch(() => {
                    assert(false);
                    reject()
                  });
            });
            
        });

        it("should successfully resolve promise after processing all message handlers", async function(){
            var cb1 = sinon.stub(),
                cb2 = sinon.stub(),
                cb3 = sinon.stub(),
                message = {
                    CorrelationId: "abc",
                    data: "12345"
                },
                headers = { token: 123 },
                type = "LogCommand";

            let bus = new Bus({
                amqpSettings: { queue:{name: "Test"} },
                handlers: {
                    "LogCommand": [ cb1, cb2 ],
                    "LogCommand2": [ cb3 ]
                }
            });
            await bus.init();

            var result = bus._consumeMessage(message, headers, type);

            return new Promise<void>((resolve, reject) => {
                result.then(() => {
                    assert(true);
                    resolve()
                  }).catch(() => {
                    assert(false);
                    reject()
                  });
            });
            
        });

        it("should successfully resolve promise after processing handlers that return promises", async () => {
            var cb1 = sinon.stub().returns(new Promise<void>((res, _) => res())),
                cb2 = sinon.stub().returns(new Promise<void>((res, _) => res())),
                cb3 = sinon.stub(),
                message = {
                    CorrelationId: "abc",
                    data: "12345"
                },
                headers = { token: 123 },
                type = "LogCommand";

            let bus = new Bus({
                amqpSettings: { queue:{name: "Test"} },
                handlers: {
                    "LogCommand": [ cb1, cb2 ],
                    "LogCommand2": [ cb3 ]
                }
            });
            await bus.init();

            var result = bus._consumeMessage(message, headers, type);

            return new Promise<void>((resolve, reject) => {
                result.then(() => {
                    assert(true);
                    resolve()
                  }).catch(() => {
                    assert(false);
                    reject()
                  });
            });
            
        });

        it("reply callback should send message to source address", async function(){

            var stub1 = sinon.stub(settingsObject.client.prototype, 'send');

            var replyMessage = {
                CorrelationId: "abc",message: 123},
                cb1 = (message : any, headers : any, type : any, replyCallback : any) => {
                    replyCallback("TestReply", replyMessage);
                },
                message = {
                    CorrelationId: "abc",
                    data: "12345"
                },
                headers = { token: 123, SourceAddress: "Source" },
                type = "LogCommand";

            let bus = new Bus({
                amqpSettings: { queue:{name: "Test"} },
                handlers: {
                    "LogCommand": [ cb1 ]
                }
            });
            await bus.init();

            return new Promise<void>((resolve, reject) => {
                bus._consumeMessage(message, headers, type)
                    .then(r => {
                        assert.isTrue(stub1.calledWith("Source", "TestReply", replyMessage, headers));
                        (settingsObject.client as any).prototype.send.restore();
                        resolve()
                    })
                    .catch(e => {
                        assert(false);
                        reject()
                    });
            });
            

        });

        it("should throw error if a handler throws an exception", async function(){

            var cb1 = sinon.stub(),
                cb2 = sinon.stub(),
                cb3 = sinon.stub(),
                message = {
                    CorrelationId: "abc",
                    data: "12345"
                },
                headers = { token: 123 },
                type = "LogCommand";

            cb1.throws({
                error: "cb1 error"
            });

            let bus = new Bus({
                amqpSettings: { queue:{name: "Test"} },
                handlers: {
                    "LogCommand": [ cb1, cb2 ],
                    "LogCommand2": [ cb3 ]
                }
            });
            await bus.init();

            return new Promise<void>((resolve, reject) => {
                bus._consumeMessage(message, headers, type)
                    .then(r => {
                        assert(false);                        
                        reject("Should throw an exception")
                    })
                    .catch(e => {
                        assert(true);
                        resolve()
                    });
            });
            
        });

        it("should throw error if a handler returns a rejected promise", async function(){

            var cb1 = sinon.stub().returns(new Promise((_, rej) => rej())),
                cb2 = sinon.stub(),
                cb3 = sinon.stub(),
                message = {
                    CorrelationId: "abc",
                    data: "12345"
                },
                headers = { token: 123 },
                type = "LogCommand";

            cb1.throws({
                error: "cb1 error"
            });

            let bus = new Bus({
                amqpSettings: { queue:{name: "Test"} },
                handlers: {
                    "LogCommand": [ cb1, cb2 ],
                    "LogCommand2": [ cb3 ]
                }
            });
            await bus.init();

            return new Promise<void>((resolve, reject) => {
                bus._consumeMessage(message, headers, type)
                .then(r => {
                    assert(false);
                    reject("Should throw an exception")
                })
                .catch(e => {
                    assert(true);
                    resolve()
                });
            });
            
        });

        it("if a handler throws an exception the error callback method should be called", async function(){
            var cb1 = sinon.stub(),
                cb2 = sinon.stub(),
                cb3 = sinon.stub(),
                error = sinon.stub(),
                message = {
                    CorrelationId: "abc",
                    data: "12345"
                },
                headers = { token: 123 },
                type = "LogCommand";

            cb1.throws(new Error("cb1 error"));

            let bus = new Bus({
                amqpSettings: { queue:{name: "Test"} },
                handlers: {
                    "LogCommand": [ cb1, cb2 ],
                    "LogCommand2": [ cb3 ]
                },
                logger: {
                    error: (m:string, e?: unknown) => error,
                    info: (m:string) => {}
                }
            });
            await bus.init();

            let err = false
            try {
                await bus._consumeMessage(message, headers, type)
            } catch (e) {
                err = true
            }
            expect(err).to.be.true;
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
