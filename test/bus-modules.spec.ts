
import chai from 'chai';
import sinon from 'sinon';
import { RequestReplyManager } from '../src/bus/request-reply-manager';
import { FilterManager } from '../src/bus/filter-manager';
import { MessageHandlerManager } from '../src/bus/message-handler';
import { Bus } from '../src/bus/index';
import type { Message, CorrelationId, MessageHeaders, MessageHandler } from '../src/types';

let expect = chai.expect;
let assert = chai.assert;

// Helper function to create a valid message
function createMessage(data: unknown = {}): Message {
    return {
        CorrelationId: `corr-${Date.now()}-${Math.random()}` as CorrelationId,
        ...data as object
    };
}

// Helper function to create headers
function createHeaders(extra: Record<string, unknown> = {}): MessageHeaders {
    return {
        DestinationAddress: 'test-endpoint',
        ...extra
    };
}

// Helper function to create a typed message handler stub
function createHandlerStub(): MessageHandler<Message> {
    return sinon.stub() as unknown as MessageHandler<Message>;
}

describe("Bus Modules", function() {

    describe("RequestReplyManager", function() {
        let manager: RequestReplyManager;

        beforeEach(function() {
            manager = new RequestReplyManager();
        });

        describe("registerRequest", function() {
            it("should register request with timeout", function(done) {
                const messageId = "test-msg-1";
                const callback = sinon.stub();
                const timeoutMs = 50;

                manager.registerRequest(messageId, 1, callback, timeoutMs);

                expect(manager.hasPendingRequest(messageId)).to.be.true;
                expect(manager.getPendingCount()).to.equal(1);

                // Wait for timeout
                setTimeout(() => {
                    expect(callback.called).to.be.true;
                    const callArgs = callback.getCall(0).args;
                    expect(callArgs[0]).to.deep.include({ timedOut: true, messageId });
                    expect(callArgs[1]).to.deep.include({ timedOut: true });
                    expect(callArgs[2]).to.equal('Timeout');
                    expect(manager.hasPendingRequest(messageId)).to.be.false;
                    done();
                }, timeoutMs + 20);
            });

            it("should register request without timeout", function() {
                const messageId = "test-msg-2";
                const callback = sinon.stub();

                manager.registerRequest(messageId, 1, callback, null);

                expect(manager.hasPendingRequest(messageId)).to.be.true;
                expect(manager.getPendingCount()).to.equal(1);
            });

            it("should register request with timeout of 0 (no timeout)", function() {
                const messageId = "test-msg-3";
                const callback = sinon.stub();

                manager.registerRequest(messageId, 1, callback, 0);

                expect(manager.hasPendingRequest(messageId)).to.be.true;
                expect(manager.getPendingCount()).to.equal(1);
            });
        });

        describe("processReply", function() {
            it("should process reply and invoke callback", async function() {
                const messageId = "test-msg-4";
                const callback = sinon.stub();
                const message = createMessage({ data: "test" });
                const headers = createHeaders({ header1: "value1" });
                const type = "TestMessage";

                manager.registerRequest(messageId, 1, callback, null);
                await manager.processReply(messageId, message, headers, type);

                expect(callback.calledOnce).to.be.true;
                expect(callback.calledWith(message, headers, type)).to.be.true;
                expect(manager.hasPendingRequest(messageId)).to.be.false;
            });

            it("should process reply for non-existent request without error", async function() {
                const messageId = "non-existent";
                const message = createMessage({ data: "test" });
                const headers = createHeaders();
                const type = "TestMessage";

                // Should not throw
                await manager.processReply(messageId, message, headers, type);
                expect(manager.getPendingCount()).to.equal(0);
            });

            it("should keep request pending if not all replies received", async function() {
                const messageId = "test-msg-5";
                const callback = sinon.stub();

                manager.registerRequest(messageId, 3, callback, null);

                await manager.processReply(messageId, createMessage({ data: 1 }), createHeaders(), "Type1");
                expect(manager.hasPendingRequest(messageId)).to.be.true;
                expect(manager.getPendingCount()).to.equal(1);

                await manager.processReply(messageId, createMessage({ data: 2 }), createHeaders(), "Type2");
                expect(manager.hasPendingRequest(messageId)).to.be.true;
                expect(manager.getPendingCount()).to.equal(1);

                await manager.processReply(messageId, createMessage({ data: 3 }), createHeaders(), "Type3");
                expect(manager.hasPendingRequest(messageId)).to.be.false;
                expect(manager.getPendingCount()).to.equal(0);
            });

            it("should not clean up request with endpointCount -1 after first reply", async function() {
                const messageId = "scatter-gather-test";
                const callback = sinon.stub();

                manager.registerRequest(messageId, -1, callback, null);

                await manager.processReply(messageId, createMessage({ data: 1 }), createHeaders(), "Reply1");
                expect(callback.calledOnce).to.be.true;
                expect(manager.hasPendingRequest(messageId)).to.be.true;

                await manager.processReply(messageId, createMessage({ data: 2 }), createHeaders(), "Reply2");
                expect(callback.calledTwice).to.be.true;
                expect(manager.hasPendingRequest(messageId)).to.be.true;
            });

            it("should track multiple endpoints independently", async function() {
                const messageId1 = "test-msg-6";
                const messageId2 = "test-msg-7";
                const callback1 = sinon.stub();
                const callback2 = sinon.stub();

                manager.registerRequest(messageId1, 1, callback1, null);
                manager.registerRequest(messageId2, 2, callback2, null);

                expect(manager.getPendingCount()).to.equal(2);

                await manager.processReply(messageId1, createMessage({ data: 1 }), createHeaders(), "Type1");
                expect(manager.hasPendingRequest(messageId1)).to.be.false;
                expect(manager.hasPendingRequest(messageId2)).to.be.true;

                await manager.processReply(messageId2, createMessage({ data: 2 }), createHeaders(), "Type2");
                expect(manager.hasPendingRequest(messageId2)).to.be.true;

                await manager.processReply(messageId2, createMessage({ data: 3 }), createHeaders(), "Type3");
                expect(manager.hasPendingRequest(messageId2)).to.be.false;
                expect(manager.getPendingCount()).to.equal(0);
            });
        });

        describe("hasPendingRequest", function() {
            it("should return true for pending request", function() {
                const messageId = "test-msg-8";
                manager.registerRequest(messageId, 1, () => {}, null);

                expect(manager.hasPendingRequest(messageId)).to.be.true;
            });

            it("should return false for non-existent request", function() {
                expect(manager.hasPendingRequest("non-existent")).to.be.false;
            });

            it("should return false after request is processed", async function() {
                const messageId = "test-msg-9";
                manager.registerRequest(messageId, 1, () => {}, null);

                await manager.processReply(messageId, createMessage(), createHeaders(), "Type");

                expect(manager.hasPendingRequest(messageId)).to.be.false;
            });
        });

        describe("cleanupAll", function() {
            it("should clean up all pending requests", function() {
                manager.registerRequest("msg-1", 1, () => {}, null);
                manager.registerRequest("msg-2", 1, () => {}, null);
                manager.registerRequest("msg-3", 1, () => {}, null);

                expect(manager.getPendingCount()).to.equal(3);

                manager.cleanupAll();

                expect(manager.getPendingCount()).to.equal(0);
                expect(manager.hasPendingRequest("msg-1")).to.be.false;
                expect(manager.hasPendingRequest("msg-2")).to.be.false;
                expect(manager.hasPendingRequest("msg-3")).to.be.false;
            });

            it("should clear all timeouts", function(done) {
                const callback = sinon.stub();

                manager.registerRequest("msg-1", 1, callback, 50);
                manager.registerRequest("msg-2", 1, () => {}, 100);

                manager.cleanupAll();

                // Wait to ensure no timeout callbacks are fired
                setTimeout(() => {
                    expect(callback.called).to.be.false;
                    done();
                }, 150);
            });
        });

        describe("request/reply overhaul", function() {
            it("should enforce timeout when endpointCount is -1 and no timeout given", function() {
                manager.registerRequest('msg1', -1, sinon.stub(), null, 30000);
                assert.isTrue(manager.hasPendingRequest('msg1'));
                manager.cleanupAll();
            });

            it("should increment processedCount only after callback succeeds", async function() {
                let callCount = 0;
                const callback = sinon.stub().callsFake(async () => {
                    callCount++;
                    if (callCount === 1) {
                        throw new Error('Callback failed');
                    }
                });
                // endpointCount=1: a single successful callback should complete the request
                manager.registerRequest('msg1', 1, callback, 5000, 30000);

                // First call fails - processedCount should NOT be incremented
                try {
                    await manager.processReply('msg1', { CorrelationId: 'a' } as any, { SourceAddress: 'ep-A' }, 'Type');
                } catch {
                    // expected
                }

                // With buggy code: processedCount was incremented to 1 before callback,
                // so the request would already be cleaned up (endpointCount=1).
                // With correct code: processedCount stays 0, request remains pending.
                assert.isTrue(manager.hasPendingRequest('msg1'), 'request should still be pending after failed callback');

                // Second call succeeds - now processedCount should increment and complete
                await manager.processReply('msg1', { CorrelationId: 'b' } as any, { SourceAddress: 'ep-B' }, 'Type');
                assert.isFalse(manager.hasPendingRequest('msg1'), 'request should be completed after successful callback');
                manager.cleanupAll();
            });

            it("should deduplicate retried replies by message source", async function() {
                const callback = sinon.stub().resolves();
                manager.registerRequest('msg1', 2, callback, 5000, 30000);

                const headers1 = { SourceAddress: 'endpoint-A' };
                await manager.processReply('msg1', { CorrelationId: 'a' } as any, headers1, 'Type');
                await manager.processReply('msg1', { CorrelationId: 'a' } as any, headers1, 'Type');

                assert.strictEqual(callback.callCount, 1, 'duplicate reply should be ignored');
                assert.isTrue(manager.hasPendingRequest('msg1'));
                manager.cleanupAll();
            });
        });

        describe("timeout expiration", function() {
            it("should call callback with timeout indicator on expiration", function(done) {
                const messageId = "timeout-test";
                const callback = sinon.stub();
                const timeoutMs = 30;

                manager.registerRequest(messageId, 1, callback, timeoutMs);

                setTimeout(() => {
                    expect(callback.calledOnce).to.be.true;
                    const args = callback.getCall(0).args;
                    expect(args[0]).to.have.property('timedOut', true);
                    expect(args[0]).to.have.property('messageId', messageId);
                    expect(args[1]).to.have.property('timedOut', true);
                    expect(args[2]).to.equal('Timeout');
                    done();
                }, timeoutMs + 20);
            });

            it("should clean up request after timeout", function(done) {
                const messageId = "cleanup-test";
                const timeoutMs = 30;

                manager.registerRequest(messageId, 1, () => {}, timeoutMs);

                setTimeout(() => {
                    expect(manager.hasPendingRequest(messageId)).to.be.false;
                    expect(manager.getPendingCount()).to.equal(0);
                    done();
                }, timeoutMs + 20);
            });

            it("should not trigger timeout if reply received before expiration", async function() {
                const messageId = "early-reply";
                const callback = sinon.stub();
                const timeoutMs = 100;

                manager.registerRequest(messageId, 1, callback, timeoutMs);

                // Send reply immediately
                await manager.processReply(messageId, createMessage({ data: "reply" }), createHeaders(), "Reply");

                expect(manager.hasPendingRequest(messageId)).to.be.false;
                expect(callback.calledOnce).to.be.true;

                // Wait for timeout to ensure it doesn't fire
                await new Promise(resolve => setTimeout(resolve, timeoutMs + 20));

                // Callback should only be called once (not twice)
                expect(callback.calledOnce).to.be.true;
            });
        });
    });

    describe("FilterManager", function() {
        let manager: FilterManager;
        let mockBus: sinon.SinonStubbedInstance<Bus>;

        beforeEach(function() {
            manager = new FilterManager();
            mockBus = sinon.createStubInstance(Bus);
        });

        describe("executeBefore", function() {
            it("should execute before filters", async function() {
                const filter1 = sinon.stub().resolves(true);
                const filter2 = sinon.stub().resolves(true);
                const message = createMessage({ data: "test" });
                const headers = createHeaders({ header1: "value1" });
                const type = "TestMessage";

                const result = await manager.executeBefore(
                    [filter1, filter2],
                    message,
                    headers,
                    type,
                    mockBus as any
                );

                expect(result).to.be.true;
                expect(filter1.calledOnce).to.be.true;
                expect(filter2.calledOnce).to.be.true;
                expect(filter1.calledWith(message, headers, type, mockBus)).to.be.true;
                expect(filter2.calledWith(message, headers, type, mockBus)).to.be.true;
            });

            it("should short-circuit on false return", async function() {
                const filter1 = sinon.stub().resolves(true);
                const filter2 = sinon.stub().resolves(false);
                const filter3 = sinon.stub().resolves(true);
                const message = createMessage({ data: "test" });
                const headers = createHeaders();
                const type = "TestMessage";

                const result = await manager.executeBefore(
                    [filter1, filter2, filter3],
                    message,
                    headers,
                    type,
                    mockBus as any
                );

                expect(result).to.be.false;
                expect(filter1.calledOnce).to.be.true;
                expect(filter2.calledOnce).to.be.true;
                expect(filter3.called).to.be.false;
            });

            it("should handle async filters", async function() {
                const filter1 = async () => {
                    await new Promise(resolve => setTimeout(resolve, 10));
                    return true;
                };
                const filter2 = async () => {
                    await new Promise(resolve => setTimeout(resolve, 10));
                    return true;
                };
                const message = createMessage({ data: "test" });

                const result = await manager.executeBefore(
                    [filter1, filter2],
                    message,
                    createHeaders(),
                    "Type",
                    mockBus as any
                );

                expect(result).to.be.true;
            });
        });

        describe("executeAfter", function() {
            it("should execute after filters", async function() {
                const filter1 = sinon.stub().resolves(true);
                const filter2 = sinon.stub().resolves(true);
                const message = createMessage({ data: "test" });
                const headers = createHeaders({ header1: "value1" });
                const type = "TestMessage";

                const result = await manager.executeAfter(
                    [filter1, filter2],
                    message,
                    headers,
                    type,
                    mockBus as any
                );

                expect(result).to.be.true;
                expect(filter1.calledOnce).to.be.true;
                expect(filter2.calledOnce).to.be.true;
                expect(filter1.calledWith(message, headers, type, mockBus)).to.be.true;
                expect(filter2.calledWith(message, headers, type, mockBus)).to.be.true;
            });

            it("should short-circuit on false return", async function() {
                const filter1 = sinon.stub().resolves(true);
                const filter2 = sinon.stub().resolves(false);
                const filter3 = sinon.stub().resolves(true);
                const message = createMessage({ data: "test" });
                const headers = createHeaders();
                const type = "TestMessage";

                const result = await manager.executeAfter(
                    [filter1, filter2, filter3],
                    message,
                    headers,
                    type,
                    mockBus as any
                );

                expect(result).to.be.false;
                expect(filter1.calledOnce).to.be.true;
                expect(filter2.calledOnce).to.be.true;
                expect(filter3.called).to.be.false;
            });
        });

        describe("executeOutgoing", function() {
            it("should execute outgoing filters", async function() {
                const filter1 = sinon.stub().resolves(true);
                const filter2 = sinon.stub().resolves(true);
                const message = createMessage({ data: "test" });
                const headers = createHeaders({ header1: "value1" });
                const type = "TestMessage";

                const result = await manager.executeOutgoing(
                    [filter1, filter2],
                    message,
                    headers,
                    type,
                    mockBus as any
                );

                expect(result).to.be.true;
                expect(filter1.calledOnce).to.be.true;
                expect(filter2.calledOnce).to.be.true;
                expect(filter1.calledWith(message, headers, type, mockBus)).to.be.true;
                expect(filter2.calledWith(message, headers, type, mockBus)).to.be.true;
            });

            it("should short-circuit on false return", async function() {
                const filter1 = sinon.stub().resolves(true);
                const filter2 = sinon.stub().resolves(false);
                const filter3 = sinon.stub().resolves(true);
                const message = createMessage({ data: "test" });
                const headers = createHeaders();
                const type = "TestMessage";

                const result = await manager.executeOutgoing(
                    [filter1, filter2, filter3],
                    message,
                    headers,
                    type,
                    mockBus as any
                );

                expect(result).to.be.false;
                expect(filter1.calledOnce).to.be.true;
                expect(filter2.calledOnce).to.be.true;
                expect(filter3.called).to.be.false;
            });
        });

        describe("filter chain order", function() {
            it("should execute filters in order", async function() {
                const executionOrder: number[] = [];
                const filter1 = () => { executionOrder.push(1); return true; };
                const filter2 = () => { executionOrder.push(2); return true; };
                const filter3 = () => { executionOrder.push(3); return true; };
                const filter4 = () => { executionOrder.push(4); return true; };

                await manager.executeFilters(
                    [filter1, filter2, filter3, filter4],
                    createMessage({ data: "test" }),
                    createHeaders(),
                    "Type",
                    mockBus as any
                );

                expect(executionOrder).to.deep.equal([1, 2, 3, 4]);
            });

            it("should execute async filters sequentially in order", async function() {
                const executionOrder: number[] = [];
                const filter1 = async () => {
                    await new Promise(resolve => setTimeout(resolve, 20));
                    executionOrder.push(1);
                    return true;
                };
                const filter2 = async () => {
                    await new Promise(resolve => setTimeout(resolve, 10));
                    executionOrder.push(2);
                    return true;
                };
                const filter3 = async () => {
                    await new Promise(resolve => setTimeout(resolve, 5));
                    executionOrder.push(3);
                    return true;
                };

                await manager.executeFilters(
                    [filter1, filter2, filter3],
                    createMessage({ data: "test" }),
                    createHeaders(),
                    "Type",
                    mockBus as any
                );

                expect(executionOrder).to.deep.equal([1, 2, 3]);
            });

            it("should execute mixed sync/async filters in order", async function() {
                const executionOrder: number[] = [];
                const filter1 = () => { executionOrder.push(1); return true; };
                const filter2 = async () => {
                    await new Promise(resolve => setTimeout(resolve, 10));
                    executionOrder.push(2);
                    return true;
                };
                const filter3 = () => { executionOrder.push(3); return true; };
                const filter4 = async () => {
                    await new Promise(resolve => setTimeout(resolve, 5));
                    executionOrder.push(4);
                    return true;
                };

                await manager.executeFilters(
                    [filter1, filter2, filter3, filter4],
                    createMessage({ data: "test" }),
                    createHeaders(),
                    "Type",
                    mockBus as any
                );

                expect(executionOrder).to.deep.equal([1, 2, 3, 4]);
            });
        });

        describe("async filters", function() {
            it("should handle filters that return promises", async function() {
                const filter1 = () => Promise.resolve(true);
                const filter2 = () => Promise.resolve(true);
                const message = createMessage({ data: "test" });

                const result = await manager.executeBefore(
                    [filter1, filter2],
                    message,
                    createHeaders(),
                    "Type",
                    mockBus as any
                );

                expect(result).to.be.true;
            });

            it("should handle filters with async operations", async function() {
                let counter = 0;
                const filter1 = async () => {
                    counter += await Promise.resolve(1);
                    return true;
                };
                const filter2 = async () => {
                    counter += await Promise.resolve(2);
                    return true;
                };

                await manager.executeBefore(
                    [filter1, filter2],
                    createMessage(),
                    createHeaders(),
                    "Type",
                    mockBus as any
                );

                expect(counter).to.equal(3);
            });

            it("should reject if filter throws", async function() {
                const filter1 = sinon.stub().resolves(true);
                const filter2 = () => { throw new Error("Filter error"); };
                const filter3 = sinon.stub().resolves(true);

                try {
                    await manager.executeBefore(
                        [filter1, filter2, filter3],
                        createMessage(),
                        createHeaders(),
                        "Type",
                        mockBus as any
                    );
                    assert.fail("Should have thrown");
                } catch (e) {
                    expect((e as Error).message).to.equal("Filter error");
                    expect(filter1.calledOnce).to.be.true;
                    expect(filter3.called).to.be.false;
                }
            });

            it("should reject if filter returns rejected promise", async function() {
                const filter1 = sinon.stub().resolves(true);
                const filter2 = () => Promise.reject(new Error("Promise rejected"));
                const filter3 = sinon.stub().resolves(true);

                try {
                    await manager.executeBefore(
                        [filter1, filter2, filter3],
                        createMessage(),
                        createHeaders(),
                        "Type",
                        mockBus as any
                    );
                    assert.fail("Should have thrown");
                } catch (e) {
                    expect((e as Error).message).to.equal("Promise rejected");
                    expect(filter1.calledOnce).to.be.true;
                    expect(filter3.called).to.be.false;
                }
            });
        });

        describe("empty filters", function() {
            it("should return true for empty filter array", async function() {
                const result = await manager.executeBefore(
                    [],
                    createMessage({ data: "test" }),
                    createHeaders(),
                    "Type",
                    mockBus as any
                );

                expect(result).to.be.true;
            });
        });
    });

    describe("MessageHandlerManager", function() {
        let manager: MessageHandlerManager;

        beforeEach(function() {
            manager = new MessageHandlerManager();
        });

        describe("addHandler", function() {
            it("should add handler for message type", function() {
                const handler1 = createHandlerStub();
                const handler2 = createHandlerStub();

                manager.addHandler("TestMessage", handler1);
                manager.addHandler("TestMessage", handler2);

                expect(manager.isHandled("TestMessage")).to.be.true;
                expect(manager.getHandlerCount("TestMessage")).to.equal(2);
            });

            it("should add handlers for different message types", function() {
                const handler1 = createHandlerStub();
                const handler2 = createHandlerStub();

                manager.addHandler("TypeA", handler1);
                manager.addHandler("TypeB", handler2);

                expect(manager.isHandled("TypeA")).to.be.true;
                expect(manager.isHandled("TypeB")).to.be.true;
                expect(manager.getHandlerCount("TypeA")).to.equal(1);
                expect(manager.getHandlerCount("TypeB")).to.equal(1);
            });

            it("should add wildcard handler", function() {
                const handler = createHandlerStub();

                manager.addHandler("*", handler);

                expect(manager.isHandled("*")).to.be.true;
                // getHandlerCount includes wildcard handlers, so for "*" it will be 2
                // (the specific handler for "*" + the wildcard handler for "*")
                expect(manager.getHandlerCount("*")).to.equal(2);
            });
        });

        describe("removeHandler", function() {
            it("should remove handler for message type", function() {
                const handler1 = createHandlerStub();
                const handler2 = createHandlerStub();

                manager.addHandler("TestMessage", handler1);
                manager.addHandler("TestMessage", handler2);

                const result = manager.removeHandler("TestMessage", handler1);

                expect(result).to.be.true;
                expect(manager.getHandlerCount("TestMessage")).to.equal(1);
                expect(manager.getHandlers("TestMessage")).to.include(handler2);
            });

            it("should return false when removing non-existent handler", function() {
                const handler1 = createHandlerStub();
                const handler2 = createHandlerStub();

                manager.addHandler("TestMessage", handler1);

                const result = manager.removeHandler("TestMessage", handler2);

                expect(result).to.be.false;
                expect(manager.getHandlerCount("TestMessage")).to.equal(1);
            });

            it("should return false when removing from non-existent message type", function() {
                const handler = createHandlerStub();

                const result = manager.removeHandler("NonExistent", handler);

                expect(result).to.be.false;
            });

            it("should handle removing handler that was added twice", function() {
                const handler = createHandlerStub();

                manager.addHandler("TestMessage", handler);
                manager.addHandler("TestMessage", handler);

                // Remove first occurrence
                let result = manager.removeHandler("TestMessage", handler);
                expect(result).to.be.true;
                expect(manager.getHandlerCount("TestMessage")).to.equal(1);

                // Remove second occurrence
                result = manager.removeHandler("TestMessage", handler);
                expect(result).to.be.true;
                expect(manager.getHandlerCount("TestMessage")).to.equal(0);
            });
        });

        describe("isHandled", function() {
            it("should return true when handlers exist", function() {
                manager.addHandler("TestMessage", createHandlerStub());

                expect(manager.isHandled("TestMessage")).to.be.true;
            });

            it("should return false when no handlers exist", function() {
                expect(manager.isHandled("TestMessage")).to.be.false;
            });

            it("should return false when handlers array is empty", function() {
                // Add and remove to create empty array
                const handler = createHandlerStub();
                manager.addHandler("TestMessage", handler);
                manager.removeHandler("TestMessage", handler);

                expect(manager.isHandled("TestMessage")).to.be.false;
            });

            it("should return true for wildcard handler", function() {
                manager.addHandler("*", createHandlerStub());

                expect(manager.isHandled("*")).to.be.true;
            });
        });

        describe("getHandlers", function() {
            it("should get handlers for specific message type", function() {
                const handler1 = createHandlerStub();
                const handler2 = createHandlerStub();

                manager.addHandler("TestMessage", handler1);
                manager.addHandler("TestMessage", handler2);

                const handlers = manager.getHandlers("TestMessage");

                expect(handlers).to.have.length(2);
                expect(handlers).to.include(handler1);
                expect(handlers).to.include(handler2);
            });

            it("should include wildcard handlers", function() {
                const specificHandler = createHandlerStub();
                const wildcardHandler = createHandlerStub();

                manager.addHandler("TestMessage", specificHandler);
                manager.addHandler("*", wildcardHandler);

                const handlers = manager.getHandlers("TestMessage");

                expect(handlers).to.have.length(2);
                expect(handlers).to.include(specificHandler);
                expect(handlers).to.include(wildcardHandler);
            });

            it("should return only wildcard handlers for unmatched types", function() {
                const wildcardHandler = createHandlerStub();

                manager.addHandler("*", wildcardHandler);

                const handlers = manager.getHandlers("UnmatchedType");

                expect(handlers).to.have.length(1);
                expect(handlers).to.include(wildcardHandler);
            });

            it("should return empty array for unmatched types without wildcard", function() {
                manager.addHandler("OtherType", createHandlerStub());

                const handlers = manager.getHandlers("TestMessage");

                expect(handlers).to.be.an('array').that.is.empty;
            });

            it("should maintain order: specific handlers first, then wildcard", function() {
                const specific1 = sinon.stub();
                const specific2 = sinon.stub();
                const wildcard = sinon.stub();

                manager.addHandler("*", wildcard);
                manager.addHandler("TestMessage", specific1);
                manager.addHandler("TestMessage", specific2);

                const handlers = manager.getHandlers("TestMessage");

                expect(handlers[0]).to.equal(specific1);
                expect(handlers[1]).to.equal(specific2);
                expect(handlers[2]).to.equal(wildcard);
            });
        });

        describe("getHandlerCount", function() {
            it("should return count of specific handlers", function() {
                manager.addHandler("TestMessage", createHandlerStub());
                manager.addHandler("TestMessage", createHandlerStub());

                expect(manager.getHandlerCount("TestMessage")).to.equal(2);
            });

            it("should include wildcard handlers in count", function() {
                manager.addHandler("TestMessage", createHandlerStub());
                manager.addHandler("*", createHandlerStub());

                expect(manager.getHandlerCount("TestMessage")).to.equal(2);
            });

            it("should return 0 for non-existent type", function() {
                expect(manager.getHandlerCount("NonExistent")).to.equal(0);
            });

            it("should return 0 for type with only wildcard handler when querying different type", function() {
                manager.addHandler("*", createHandlerStub());

                // Count for a specific type that has no direct handlers
                expect(manager.getHandlerCount("TestMessage")).to.equal(1);
            });
        });

        describe("hasNoHandlers", function() {
            it("should return true for non-existent type", function() {
                expect(manager.hasNoHandlers("TestMessage")).to.be.true;
            });

            it("should return false when handlers exist", function() {
                manager.addHandler("TestMessage", createHandlerStub());

                expect(manager.hasNoHandlers("TestMessage")).to.be.false;
            });

            it("should return true after removing all handlers", function() {
                const handler = createHandlerStub();
                manager.addHandler("TestMessage", handler);
                manager.removeHandler("TestMessage", handler);

                expect(manager.hasNoHandlers("TestMessage")).to.be.true;
            });

            it("should return true for empty handlers array", function() {
                // Add and remove to create empty array
                const handler = createHandlerStub();
                manager.addHandler("TestMessage", handler);
                manager.removeHandler("TestMessage", handler);

                expect(manager.hasNoHandlers("TestMessage")).to.be.true;
            });
        });

        describe("getHandlersConfig", function() {
            it("should return copy of handlers config", function() {
                const handler1 = createHandlerStub();
                const handler2 = createHandlerStub();

                manager.addHandler("TypeA", handler1);
                manager.addHandler("TypeB", handler2);

                const config = manager.getHandlersConfig();

                expect(config).to.have.property("TypeA");
                expect(config).to.have.property("TypeB");
                expect(config.TypeA).to.deep.equal([handler1]);
                expect(config.TypeB).to.deep.equal([handler2]);
            });

            it("should return independent copy", function() {
                const handler = createHandlerStub();
                manager.addHandler("TypeA", handler);

                const config = manager.getHandlersConfig();
                // Modify the returned config object (not the arrays)
                delete (config as any).TypeA;

                // Original manager should be unchanged
                expect(manager.isHandled("TypeA")).to.be.true;
                expect(manager.getHandlersConfig()).to.have.property("TypeA");
            });
        });

        describe("initializeFromConfig", function() {
            it("should initialize from handlers config", function() {
                const handler1 = createHandlerStub();
                const handler2 = createHandlerStub();
                const config = {
                    "TypeA": [handler1],
                    "TypeB": [handler2]
                };

                manager.initializeFromConfig(config);

                expect(manager.isHandled("TypeA")).to.be.true;
                expect(manager.isHandled("TypeB")).to.be.true;
                expect(manager.getHandlerCount("TypeA")).to.equal(1);
                expect(manager.getHandlerCount("TypeB")).to.equal(1);
            });

            it("should replace existing handlers", function() {
                const oldHandler = createHandlerStub();
                manager.addHandler("TypeA", oldHandler);

                const newHandler = createHandlerStub();
                const config = {
                    "TypeB": [newHandler]
                };

                manager.initializeFromConfig(config);

                expect(manager.hasNoHandlers("TypeA")).to.be.true;
                expect(manager.isHandled("TypeB")).to.be.true;
            });
        });

        describe("delete handler key when last handler removed", function() {
            it("should delete handler key when last handler is removed", function() {
                const handler = createHandlerStub();
                manager.addHandler('TestType', handler);
                manager.removeHandler('TestType', handler);
                assert.isFalse(manager.isHandled('TestType'));
                assert.deepEqual(Object.keys(manager.getHandlersConfig()), []);
            });

            it("should not leave dead empty arrays in handlers config", function() {
                const handler1 = createHandlerStub();
                const handler2 = createHandlerStub();
                manager.addHandler('TypeA', handler1);
                manager.addHandler('TypeB', handler2);
                manager.removeHandler('TypeA', handler1);

                const config = manager.getHandlersConfig();
                assert.notProperty(config, 'TypeA', 'TypeA key should be deleted after last handler removed');
                assert.property(config, 'TypeB');
            });
        });

        describe("type name normalization", function() {
            it("should normalize dotted type names when adding handlers", function() {
                const handler = createHandlerStub();
                manager.addHandler('Order.Created', handler);
                assert.isTrue(manager.isHandled('Order.Created'));
                assert.isTrue(manager.isHandled('OrderCreated'));
            });

            it("should normalize dotted type names when removing handlers", function() {
                const handler = createHandlerStub();
                manager.addHandler('Order.Created', handler);
                manager.removeHandler('OrderCreated', handler);
                assert.isFalse(manager.isHandled('Order.Created'));
                assert.isFalse(manager.isHandled('OrderCreated'));
            });

            it("should not normalize wildcard '*'", function() {
                const handler = createHandlerStub();
                manager.addHandler('*', handler);
                assert.isTrue(manager.isHandled('*'));
            });

            it("should retrieve handlers using either dotted or normalized names", function() {
                const handler = createHandlerStub();
                manager.addHandler('My.Message.Type', handler);
                const handlers1 = manager.getHandlers('My.Message.Type');
                const handlers2 = manager.getHandlers('MyMessageType');
                assert.deepEqual(handlers1, handlers2);
            });
        });

        describe("handler count tracking", function() {
            it("should track multiple handlers across multiple types", function() {
                const handlerA1 = createHandlerStub();
                const handlerA2 = createHandlerStub();
                const handlerB1 = createHandlerStub();
                const handlerWildcard = createHandlerStub();

                manager.addHandler("TypeA", handlerA1);
                manager.addHandler("TypeA", handlerA2);
                manager.addHandler("TypeB", handlerB1);
                manager.addHandler("*", handlerWildcard);

                // TypeA should have 3 handlers (2 specific + 1 wildcard)
                expect(manager.getHandlerCount("TypeA")).to.equal(3);
                // TypeB should have 2 handlers (1 specific + 1 wildcard)
                expect(manager.getHandlerCount("TypeB")).to.equal(2);
                // Wildcard alone returns 2 because getHandlers("*") includes both
                // the specific handlers for "*" and the wildcard handlers for "*"
                expect(manager.getHandlerCount("*")).to.equal(2);
                // Unmatched type should only have wildcard
                expect(manager.getHandlerCount("TypeC")).to.equal(1);
            });

            it("should accurately track after removals", function() {
                const handler1 = createHandlerStub();
                const handler2 = createHandlerStub();
                const handler3 = createHandlerStub();

                manager.addHandler("TypeA", handler1);
                manager.addHandler("TypeA", handler2);
                manager.addHandler("TypeA", handler3);

                expect(manager.getHandlerCount("TypeA")).to.equal(3);

                manager.removeHandler("TypeA", handler2);
                expect(manager.getHandlerCount("TypeA")).to.equal(2);

                manager.removeHandler("TypeA", handler1);
                expect(manager.getHandlerCount("TypeA")).to.equal(1);

                manager.removeHandler("TypeA", handler3);
                expect(manager.getHandlerCount("TypeA")).to.equal(0);
                expect(manager.hasNoHandlers("TypeA")).to.be.true;
            });
        });
    });
});
