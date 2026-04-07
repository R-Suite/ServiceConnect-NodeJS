
import chai from 'chai';
import sinon from 'sinon';
import amqp from 'amqp-connection-manager';
import type { ConsumeMessage, ConfirmChannel, Channel, Options } from 'amqplib';
import type { ChannelWrapper } from 'amqp-connection-manager';
import { ConnectionManager } from '../src/clients/rabbitmq/connection-manager';
import { QueueManager } from '../src/clients/rabbitmq/queue-manager';
import { MessageProcessor } from '../src/clients/rabbitmq/message-processor';
import { RetryManager } from '../src/clients/rabbitmq/retry-manager';
import type { BusConfig, Message, MessageHeaders } from '../src/types';
import { ConnectionError } from '../src/errors';

let expect = chai.expect;
let assert = chai.assert;

describe("RabbitMQ Modules", function() {
    let sandbox: sinon.SinonSandbox;
    let mockConfig: BusConfig;

    beforeEach(function() {
        sandbox = sinon.createSandbox();
        mockConfig = {
            amqpSettings: {
                queue: {
                    name: 'TestQueue',
                    durable: true,
                    exclusive: false,
                    autoDelete: false,
                    noAck: false,
                    arguments: undefined
                },
                ssl: {
                    enabled: false,
                    key: null,
                    passphrase: null,
                    cert: null,
                    ca: [],
                    pfx: null,
                    fail_if_no_peer_cert: false,
                    verify: 'verify_peer'
                },
                host: 'amqp://localhost',
                retryDelay: 3000,
                maxRetries: 3,
                errorQueue: 'TestQueue.Errors',
                auditQueue: 'TestQueue.Audit',
                auditEnabled: false,
                prefetch: 100,
                connectionTimeout: 30000,
                connectionRetryDelay: 30000,
                connectionMaxRetries: 5,
                defaultRequestTimeout: 10000
            },
            filters: {
                after: [],
                before: [],
                outgoing: []
            },
            handlers: {},
            client: {} as any,
            logger: {
                info: sandbox.stub(),
                error: sandbox.stub(),
                warn: sandbox.stub()
            }
        };
    });

    afterEach(function() {
        sandbox.restore();
    });

    describe("ConnectionManager", function() {
        describe("connect", function() {
            it("should connect to RabbitMQ successfully", async function() {
                const mockConnection = {
                    on: sandbox.stub().callsFake((event: string, cb: Function) => {
                        if (event === 'connect') {
                            setImmediate(() => cb());
                        }
                    }),
                    isConnected: sandbox.stub().returns(true),
                    close: sandbox.stub().resolves()
                };
                const connectStub = sandbox.stub(amqp, 'connect').returns(mockConnection as any);

                const connectionManager = new ConnectionManager(mockConfig);
                await connectionManager.connect();

                assert.isTrue(connectStub.called);
                assert.isTrue(connectionManager.isConnected());
            });

            it("should retry connection on failure before succeeding", async function() {
                let attempt = 0;
                const mockConnection = {
                    on: sandbox.stub().callsFake((event: string, cb: Function) => {
                        if (event === 'connect') {
                            if (++attempt < 2) {
                                // Simulate connectFailed event
                                setImmediate(() => {
                                    const connectFailedHandlers = mockConnection.on
                                        .getCalls()
                                        .filter((c: any) => c.args[0] === 'connectFailed')
                                        .map((c: any) => c.args[1]);
                                    connectFailedHandlers.forEach((handler: Function) => handler({ err: new Error('Connection refused') }));
                                });
                            } else {
                                setImmediate(() => cb());
                            }
                        }
                    }),
                    isConnected: sandbox.stub().returns(true),
                    close: sandbox.stub().resolves()
                };
                sandbox.stub(amqp, 'connect').returns(mockConnection as any);
                const sleepStub = sandbox.stub(ConnectionManager.prototype as any, 'sleep').resolves();

                const connectionManager = new ConnectionManager(mockConfig);
                await connectionManager.connect();

                assert.isTrue(sleepStub.called);
                assert.equal(sleepStub.callCount, 1);
                assert.isTrue(connectionManager.isConnected());
            });

            it("should close previous connection on retry", async function() {
                let attempt = 0;
                const mockConnection1Close = sandbox.stub().resolves();
                const mockConnection2Close = sandbox.stub().resolves();

                const connections = [
                    {
                        on: sandbox.stub().callsFake((event: string, cb: Function) => {
                            if (event === 'connectFailed') {
                                setImmediate(() => cb({ err: new Error('Connection refused') }));
                            }
                        }),
                        close: mockConnection1Close,
                        isConnected: sandbox.stub().returns(false)
                    },
                    {
                        on: sandbox.stub().callsFake((event: string, cb: Function) => {
                            if (event === 'connect') {
                                setImmediate(() => cb());
                            }
                        }),
                        close: mockConnection2Close,
                        isConnected: sandbox.stub().returns(true)
                    }
                ];

                const connectStub = sandbox.stub(amqp, 'connect');
                connectStub.onCall(0).returns(connections[0] as any);
                connectStub.onCall(1).returns(connections[1] as any);
                sandbox.stub(ConnectionManager.prototype as any, 'sleep').resolves();

                const connectionManager = new ConnectionManager(mockConfig);
                await connectionManager.connect();

                assert.isTrue(mockConnection1Close.calledOnce, 'Previous connection should be closed on retry');
                assert.isTrue(connectionManager.isConnected());
            });

            it("should throw ConnectionError after max retries exceeded", async function() {
                const mockConnection = {
                    on: sandbox.stub().callsFake((event: string, cb: Function) => {
                        if (event === 'connectFailed') {
                            setImmediate(() => cb({ err: new Error('Connection refused') }));
                        }
                    }),
                    close: sandbox.stub().resolves()
                };
                sandbox.stub(amqp, 'connect').returns(mockConnection as any);
                sandbox.stub(ConnectionManager.prototype as any, 'sleep').resolves();

                const connectionManager = new ConnectionManager(mockConfig);
                try {
                    await connectionManager.connect();
                    assert.fail('Should have thrown ConnectionError');
                } catch (error) {
                    assert.isTrue(error instanceof ConnectionError);
                    assert.include((error as ConnectionError).message, 'Failed to connect to RabbitMQ');
                }
            });
        });

        describe("createChannel", function() {
            it("should create a channel successfully", async function() {
                const mockChannel = {
                    on: sandbox.stub().callsFake((event: string, cb: Function) => {
                        if (event === 'connect') {
                            setImmediate(() => cb());
                        }
                    }),
                    once: sandbox.stub()
                };
                const mockConnection = {
                    on: sandbox.stub().callsFake((event: string, cb: Function) => {
                        if (event === 'connect') {
                            setImmediate(() => cb());
                        }
                    }),
                    isConnected: sandbox.stub().returns(true),
                    close: sandbox.stub().resolves(),
                    createChannel: sandbox.stub().returns(mockChannel)
                };
                sandbox.stub(amqp, 'connect').returns(mockConnection as any);

                const connectionManager = new ConnectionManager(mockConfig);
                await connectionManager.connect();

                const setupFn = sandbox.stub().resolves();
                await connectionManager.createChannel(setupFn);

                assert.isTrue(mockConnection.createChannel.called);
            });

            it("should create channel without json:true option", async function() {
                const mockChannel = {
                    on: sandbox.stub().callsFake((event: string, cb: Function) => {
                        if (event === 'connect') {
                            setImmediate(() => cb());
                        }
                    }),
                    once: sandbox.stub()
                };
                const mockConnection = {
                    on: sandbox.stub().callsFake((event: string, cb: Function) => {
                        if (event === 'connect') {
                            setImmediate(() => cb());
                        }
                    }),
                    isConnected: sandbox.stub().returns(true),
                    close: sandbox.stub().resolves(),
                    createChannel: sandbox.stub().returns(mockChannel)
                };
                sandbox.stub(amqp, 'connect').returns(mockConnection as any);

                const connectionManager = new ConnectionManager(mockConfig);
                await connectionManager.connect();

                const setupFn = sandbox.stub().resolves();
                await connectionManager.createChannel(setupFn);

                const createChannelArgs = mockConnection.createChannel.firstCall.args[0];
                assert.notStrictEqual(createChannelArgs.json, true, 'Channel should NOT be created with json:true');
            });

            it("should throw ConnectionError if not connected", async function() {
                const connectionManager = new ConnectionManager(mockConfig);

                try {
                    await connectionManager.createChannel(async () => {});
                    assert.fail('Should have thrown ConnectionError');
                } catch (error) {
                    assert.isTrue(error instanceof ConnectionError);
                    assert.include((error as ConnectionError).message, 'Not connected to RabbitMQ');
                }
            });
        });

        describe("isConnected", function() {
            it("should return false when not connected", function() {
                const connectionManager = new ConnectionManager(mockConfig);
                assert.isFalse(connectionManager.isConnected());
            });

            it("should return true when connected", async function() {
                const mockConnection = {
                    on: sandbox.stub().callsFake((event: string, cb: Function) => {
                        if (event === 'connect') {
                            setImmediate(() => cb());
                        }
                    }),
                    isConnected: sandbox.stub().returns(true),
                    close: sandbox.stub().resolves()
                };
                sandbox.stub(amqp, 'connect').returns(mockConnection as any);

                const connectionManager = new ConnectionManager(mockConfig);
                await connectionManager.connect();

                assert.isTrue(connectionManager.isConnected());
            });
        });

        describe("close", function() {
            it("should close channel and connection gracefully", async function() {
                const mockChannel = {
                    on: sandbox.stub().callsFake((event: string, cb: Function) => {
                        if (event === 'connect') {
                            setImmediate(() => cb());
                        }
                    }),
                    once: sandbox.stub(),
                    close: sandbox.stub().resolves()
                };
                const mockConnection = {
                    on: sandbox.stub().callsFake((event: string, cb: Function) => {
                        if (event === 'connect') {
                            setImmediate(() => cb());
                        }
                    }),
                    isConnected: sandbox.stub().returns(true),
                    close: sandbox.stub().resolves(),
                    createChannel: sandbox.stub().returns(mockChannel)
                };
                sandbox.stub(amqp, 'connect').returns(mockConnection as any);

                const connectionManager = new ConnectionManager(mockConfig);
                await connectionManager.connect();
                await connectionManager.createChannel(async () => {});

                await connectionManager.close();

                assert.isTrue(mockChannel.close.called);
                assert.isTrue(mockConnection.close.called);
            });

            it("should handle close when channel or connection is null", async function() {
                const connectionManager = new ConnectionManager(mockConfig);
                // Should not throw
                await connectionManager.close();
                assert.isFalse(connectionManager.isConnected());
            });
        });

        describe("getChannel", function() {
            it("should return null when no channel exists", function() {
                const connectionManager = new ConnectionManager(mockConfig);
                assert.isNull(connectionManager.getChannel());
            });

            it("should return channel after creation", async function() {
                const mockChannel = {
                    on: sandbox.stub().callsFake((event: string, cb: Function) => {
                        if (event === 'connect') {
                            setImmediate(() => cb());
                        }
                    }),
                    once: sandbox.stub(),
                    close: sandbox.stub().resolves()
                };
                const mockConnection = {
                    on: sandbox.stub().callsFake((event: string, cb: Function) => {
                        if (event === 'connect') {
                            setImmediate(() => cb());
                        }
                    }),
                    isConnected: sandbox.stub().returns(true),
                    close: sandbox.stub().resolves(),
                    createChannel: sandbox.stub().returns(mockChannel)
                };
                sandbox.stub(amqp, 'connect').returns(mockConnection as any);

                const connectionManager = new ConnectionManager(mockConfig);
                await connectionManager.connect();
                await connectionManager.createChannel(async () => {});

                const channel = connectionManager.getChannel();
                assert.isNotNull(channel);
            });
        });
    });

    describe("QueueManager", function() {
        let queueManager: QueueManager;
        let mockChannel: any;

        beforeEach(function() {
            queueManager = new QueueManager(mockConfig);
            mockChannel = {
                assertQueue: sandbox.stub().resolves(),
                assertExchange: sandbox.stub().resolves(),
                bindQueue: sandbox.stub().resolves(),
                unbindQueue: sandbox.stub().resolves(),
                deleteQueue: sandbox.stub().resolves(),
                prefetch: sandbox.stub().resolves()
            };
        });

        describe("setupQueues", function() {
            it("should create all queues including retry and error queues", async function() {
                const handlers = { "Test.Message": [] };
                await queueManager.setupQueues(mockChannel as any, handlers);

                assert.isTrue(mockChannel.assertQueue.called);
                assert.isTrue(mockChannel.assertExchange.called);
            });

            it("should create audit queue if auditEnabled is true", async function() {
                mockConfig.amqpSettings.auditEnabled = true;
                queueManager = new QueueManager(mockConfig);

                await queueManager.setupQueues(mockChannel as any, {});

                assert.isTrue(mockChannel.assertExchange.calledWith(mockConfig.amqpSettings.auditQueue));
            });

            it("should not create audit queue if auditEnabled is false", async function() {
                mockConfig.amqpSettings.auditEnabled = false;
                queueManager = new QueueManager(mockConfig);

                await queueManager.setupQueues(mockChannel as any, {});

                assert.isFalse(mockChannel.assertExchange.calledWith(mockConfig.amqpSettings.auditQueue));
            });

            it("should not create retry queue if maxRetries is 0", async function() {
                mockConfig.amqpSettings.maxRetries = 0;
                queueManager = new QueueManager(mockConfig);

                await queueManager.setupQueues(mockChannel as any, {});

                const retryExchange = `${mockConfig.amqpSettings.queue.name}.Retries.DeadLetter`;
                assert.isFalse(mockChannel.assertExchange.calledWith(retryExchange));
            });
        });

        describe("createMainQueue", function() {
            it("should create main queue with correct options", async function() {
                const handlers = { "Test.Message": [] };
                await queueManager.setupQueues(mockChannel as any, handlers);

                assert.isTrue(mockChannel.assertQueue.calledWith(
                    mockConfig.amqpSettings.queue.name,
                    sinon.match({
                        durable: mockConfig.amqpSettings.queue.durable,
                        exclusive: mockConfig.amqpSettings.queue.exclusive,
                        autoDelete: mockConfig.amqpSettings.queue.autoDelete,
                        arguments: undefined
                    })
                ));
            });

            it("should create queue without deleting when autoDelete is enabled", async function() {
                mockConfig.amqpSettings.queue.autoDelete = true;
                queueManager = new QueueManager(mockConfig);

                await queueManager.setupQueues(mockChannel as any, {});

                // With the new implementation, we try to assert first and only delete
                // if there's an argument mismatch, so we expect assertQueue to be called
                // and deleteQueue should not be called in the normal case
                assert.isTrue(mockChannel.assertQueue.calledWith(mockConfig.amqpSettings.queue.name));
            });

            it("should include maxPriority if configured", async function() {
                mockConfig.amqpSettings.queue.maxPriority = 10;
                queueManager = new QueueManager(mockConfig);

                await queueManager.setupQueues(mockChannel as any, {});

                assert.isTrue(mockChannel.assertQueue.calledWith(
                    sinon.match.string,
                    sinon.match({ maxPriority: 10 })
                ));
            });
        });

        describe("createRetryQueue", function() {
            it("should create retry queue with dead letter exchange", async function() {
                await queueManager.setupQueues(mockChannel as any, {});

                const retryQueue = `${mockConfig.amqpSettings.queue.name}.Retries`;
                const deadLetterExchange = `${mockConfig.amqpSettings.queue.name}.Retries.DeadLetter`;

                assert.isTrue(mockChannel.assertExchange.calledWith(deadLetterExchange, 'direct'));
                assert.isTrue(mockChannel.assertQueue.calledWith(retryQueue, sinon.match({
                    durable: true,
                    arguments: sinon.match({
                        'x-dead-letter-exchange': deadLetterExchange,
                        'x-message-ttl': mockConfig.amqpSettings.retryDelay
                    })
                })));
            });

            it("should not delete existing retry queue on setup", async function() {
                await queueManager.setupQueues(mockChannel as any, {});

                const retryQueue = `${mockConfig.amqpSettings.queue.name}.Retries`;
                assert.isFalse(
                    mockChannel.deleteQueue.calledWith(retryQueue),
                    'Should not delete retry queue during setup — in-flight retries would be lost'
                );
            });
        });

        describe("createErrorQueue", function() {
            it("should create error queue and exchange", async function() {
                await queueManager.setupQueues(mockChannel as any, {});

                assert.isTrue(mockChannel.assertExchange.calledWith(
                    mockConfig.amqpSettings.errorQueue,
                    'direct',
                    sinon.match({ durable: false })
                ));
                assert.isTrue(mockChannel.assertQueue.calledWith(
                    mockConfig.amqpSettings.errorQueue,
                    sinon.match({ durable: true, autoDelete: false })
                ));
            });
        });

        describe("createAuditQueue", function() {
            it("should create audit queue and exchange when auditEnabled", async function() {
                mockConfig.amqpSettings.auditEnabled = true;
                queueManager = new QueueManager(mockConfig);

                await queueManager.setupQueues(mockChannel as any, {});

                assert.isTrue(mockChannel.assertExchange.calledWith(
                    mockConfig.amqpSettings.auditQueue,
                    'direct',
                    sinon.match({ durable: false })
                ));
                assert.isTrue(mockChannel.assertQueue.calledWith(
                    mockConfig.amqpSettings.auditQueue,
                    sinon.match({ durable: true, autoDelete: false })
                ));
            });
        });

        describe("bindMessageTypes wildcard filtering", function() {
            it('should skip wildcard "*" key in bindMessageTypes', async function() {
                const handlers = { '*': [], 'OrderCreated': [] };
                await queueManager.setupQueues(mockChannel as any, handlers);

                // assertExchange should NOT be called with '*' for the bindMessageTypes step
                // It IS called for 'OrderCreated' (normalized to 'OrderCreated')
                const assertExchangeCalls = mockChannel.assertExchange.getCalls();
                const exchangeNames = assertExchangeCalls.map((c: any) => c.args[0]);

                assert.isFalse(exchangeNames.includes('*'), 'Should not create exchange for wildcard "*"');
                assert.isTrue(exchangeNames.includes('OrderCreated'), 'Should create exchange for OrderCreated');
            });
        });

        describe("consumeType", function() {
            it("should create exchange and bind queue for type", async function() {
                await queueManager.consumeType(mockChannel as any, "TestType");

                assert.isTrue(mockChannel.assertExchange.calledWith(
                    "TestType",
                    'fanout',
                    sinon.match({ durable: true })
                ));
                assert.isTrue(mockChannel.bindQueue.calledWith(
                    mockConfig.amqpSettings.queue.name,
                    "TestType",
                    ''
                ));
            });
        });

        describe("removeType", function() {
            it("should unbind queue from exchange", async function() {
                await queueManager.removeType(mockChannel as any, "TestType");

                assert.isTrue(mockChannel.unbindQueue.calledWith(
                    mockConfig.amqpSettings.queue.name,
                    "TestType",
                    ''
                ));
            });
        });
    });

    describe("MessageProcessor", function() {
        let messageProcessor: MessageProcessor;
        let mockRetryManager: any;
        let mockConsumeCallback: sinon.SinonStub;
        let mockChannel: ConfirmChannel;
        let mockChannelWrapper: ChannelWrapper;

        beforeEach(function() {
            mockConsumeCallback = sandbox.stub().resolves();
            mockRetryManager = {
                handleResult: sandbox.stub().resolves()
            };
            messageProcessor = new MessageProcessor(mockConfig, mockConsumeCallback, mockRetryManager);
            mockChannel = {
                consume: sandbox.stub().resolves({ consumerTag: 'test-tag' }),
                ack: sandbox.stub(),
                nack: sandbox.stub()
            } as any;
            mockChannelWrapper = {
                sendToQueue: sandbox.stub().resolves()
            } as any;
        });

        describe("startConsuming", function() {
            it("should start consuming messages from the queue", async function() {
                await messageProcessor.startConsuming(mockChannel, mockChannelWrapper);

                assert.isTrue(mockChannel.consume.calledWith(
                    mockConfig.amqpSettings.queue.name,
                    sinon.match.func,
                    sinon.match({ noAck: false })
                ));
            });

            it("should pass noAck from config", async function() {
                mockConfig.amqpSettings.queue.noAck = true;
                messageProcessor = new MessageProcessor(mockConfig, mockConsumeCallback, mockRetryManager);

                await messageProcessor.startConsuming(mockChannel, mockChannelWrapper);

                assert.isTrue(mockChannel.consume.calledWith(
                    sinon.match.string,
                    sinon.match.func,
                    sinon.match({ noAck: true })
                ));
            });
        });

        describe("handleMessage", function() {
            it("should process message with valid TypeName header", async function() {
                await messageProcessor.startConsuming(mockChannel, mockChannelWrapper);

                const message: ConsumeMessage = {
                    content: Buffer.from(JSON.stringify({ CorrelationId: '123', data: 'test' })),
                    properties: {
                        headers: { TypeName: 'TestMessage' }
                    }
                } as any;

                const consumeHandler = mockChannel.consume.getCall(0).args[1];
                await consumeHandler(message);

                assert.isTrue(mockConsumeCallback.calledOnce);
                assert.isTrue(mockConsumeCallback.calledWith(
                    sinon.match({ data: 'test' }),
                    sinon.match({ TypeName: 'TestMessage' }),
                    'TestMessage'
                ));
            });

            it("should skip message without TypeName header", async function() {
                await messageProcessor.startConsuming(mockChannel, mockChannelWrapper);

                const message: ConsumeMessage = {
                    content: Buffer.from(JSON.stringify({ data: 'test' })),
                    properties: {
                        headers: {}
                    }
                } as any;

                const consumeHandler = mockChannel.consume.getCall(0).args[1];
                await consumeHandler(message);

                assert.isFalse(mockConsumeCallback.called);
                assert.isTrue((mockConfig.logger?.error as sinon.SinonStub).called);
            });

            it("should still ack message when handler succeeds but retryManager.handleResult fails", async function() {
                mockRetryManager.handleResult.rejects(new Error('Channel closed'));
                await messageProcessor.startConsuming(mockChannel, mockChannelWrapper);

                const message: ConsumeMessage = {
                    content: Buffer.from(JSON.stringify({ CorrelationId: '123' })),
                    properties: {
                        headers: { TypeName: 'TestMessage' },
                        messageId: 'msg-123'
                    }
                } as any;

                const consumeHandler = mockChannel.consume.getCall(0).args[1];
                await consumeHandler(message);

                assert.isTrue((mockChannel.ack as sinon.SinonStub).calledOnce, 'Message should be ack\'d when handler succeeded');
                assert.isFalse((mockChannel.nack as sinon.SinonStub).called, 'Message should NOT be nack\'d when handler succeeded');
            });

            it("should handle null message", async function() {
                await messageProcessor.startConsuming(mockChannel, mockChannelWrapper);

                const consumeHandler = mockChannel.consume.getCall(0).args[1];
                await consumeHandler(null);

                assert.isFalse(mockConsumeCallback.called);
            });

            it("should process message with no channelWrapper available", async function() {
                await messageProcessor.startConsuming(mockChannel, null as any);

                const message: ConsumeMessage = {
                    content: Buffer.from(JSON.stringify({ CorrelationId: '123' })),
                    properties: {
                        headers: { TypeName: 'TestMessage' }
                    }
                } as any;

                const consumeHandler = mockChannel.consume.getCall(0).args[1];
                await consumeHandler(message);

                assert.isTrue(mockConsumeCallback.called);
            });
        });

        describe("processMessage", function() {
            it("should call retryManager.handleResult on success", async function() {
                await messageProcessor.startConsuming(mockChannel, mockChannelWrapper);

                mockConsumeCallback.resolves();

                const message: ConsumeMessage = {
                    content: Buffer.from(JSON.stringify({ CorrelationId: '123', data: 'test' })),
                    properties: {
                        headers: { TypeName: 'TestMessage' },
                        messageId: 'msg-123'
                    }
                } as any;

                const consumeHandler = mockChannel.consume.getCall(0).args[1];
                await consumeHandler(message);

                assert.isTrue(mockRetryManager.handleResult.calledOnce);
                const result = mockRetryManager.handleResult.getCall(0).args[2];
                assert.isTrue(result.success);
            });

            it("should call retryManager.handleResult on failure", async function() {
                await messageProcessor.startConsuming(mockChannel, mockChannelWrapper);

                const error = new Error("Processing failed");
                mockConsumeCallback.rejects(error);

                const message: ConsumeMessage = {
                    content: Buffer.from(JSON.stringify({ CorrelationId: '123' })),
                    properties: {
                        headers: { TypeName: 'TestMessage' },
                        messageId: 'msg-123'
                    }
                } as any;

                const consumeHandler = mockChannel.consume.getCall(0).args[1];
                await consumeHandler(message);

                assert.isTrue(mockRetryManager.handleResult.calledOnce);
                const result = mockRetryManager.handleResult.getCall(0).args[2];
                assert.isFalse(result.success);
                assert.isDefined(result.exception);
            });

            it("should parse JSON message content", async function() {
                await messageProcessor.startConsuming(mockChannel, mockChannelWrapper);

                const messageData = { CorrelationId: '123', customField: 'value' };
                const message: ConsumeMessage = {
                    content: Buffer.from(JSON.stringify(messageData)),
                    properties: {
                        headers: { TypeName: 'TestMessage' },
                        messageId: 'msg-123'
                    }
                } as any;

                const consumeHandler = mockChannel.consume.getCall(0).args[1];
                await consumeHandler(message);

                assert.isTrue(mockConsumeCallback.calledWith(
                    sinon.match({ customField: 'value' }),
                    sinon.match.any,
                    sinon.match.string
                ));
            });
        });

        describe("ackMessage", function() {
            it("should ack message when noAck is false", async function() {
                mockConfig.amqpSettings.queue.noAck = false;
                messageProcessor = new MessageProcessor(mockConfig, mockConsumeCallback, mockRetryManager);
                await messageProcessor.startConsuming(mockChannel, mockChannelWrapper);

                const message: ConsumeMessage = {
                    content: Buffer.from(JSON.stringify({ CorrelationId: '123' })),
                    properties: { headers: { TypeName: 'Test' } }
                } as any;

                const consumeHandler = mockChannel.consume.getCall(0).args[1];
                await consumeHandler(message);

                assert.isTrue(mockChannel.ack.called);
            });

            it("should not ack message when noAck is true", async function() {
                mockConfig.amqpSettings.queue.noAck = true;
                messageProcessor = new MessageProcessor(mockConfig, mockConsumeCallback, mockRetryManager);
                await messageProcessor.startConsuming(mockChannel, mockChannelWrapper);

                const message: ConsumeMessage = {
                    content: Buffer.from(JSON.stringify({ CorrelationId: '123' })),
                    properties: { headers: { TypeName: 'Test' } }
                } as any;

                const consumeHandler = mockChannel.consume.getCall(0).args[1];
                await consumeHandler(message);

                assert.isFalse(mockChannel.ack.called);
            });
        });

        describe("handleMessage ack/nack overhaul", function() {
            it("should ack message when handler succeeds but retryManager throws", async function() {
                const failingRetryManager = {
                    handleResult: sandbox.stub().rejects(new Error('Audit queue publish failed'))
                };
                const successCallback = sandbox.stub().resolves();
                const processor = new MessageProcessor(mockConfig, successCallback, failingRetryManager as any);
                await processor.startConsuming(mockChannel, mockChannelWrapper);

                const message: ConsumeMessage = {
                    content: Buffer.from(JSON.stringify({ CorrelationId: '123' })),
                    properties: {
                        headers: { TypeName: 'TestType' },
                        messageId: 'msg-1'
                    }
                } as any;

                const consumeHandler = (mockChannel.consume as sinon.SinonStub).getCall(0).args[1];
                await consumeHandler(message);

                assert.isTrue((mockChannel.ack as sinon.SinonStub).calledOnce, 'should ack the message');
                assert.isFalse((mockChannel.nack as sinon.SinonStub).called, 'should NOT nack when handler succeeded');
            });

            it("should nack with requeue=false when handler fails and retryManager also fails", async function() {
                const failingCallback = sandbox.stub().rejects(new Error('Handler failed'));
                const failingRetryManager = {
                    handleResult: sandbox.stub().rejects(new Error('Retry queue also failed'))
                };
                const processor = new MessageProcessor(mockConfig, failingCallback, failingRetryManager as any);
                await processor.startConsuming(mockChannel, mockChannelWrapper);

                const message: ConsumeMessage = {
                    content: Buffer.from(JSON.stringify({ CorrelationId: '123' })),
                    properties: {
                        headers: { TypeName: 'TestType' },
                        messageId: 'msg-2'
                    }
                } as any;

                const consumeHandler = (mockChannel.consume as sinon.SinonStub).getCall(0).args[1];
                await consumeHandler(message);

                assert.isTrue((mockChannel.nack as sinon.SinonStub).calledOnce, 'should nack the message');
                assert.strictEqual((mockChannel.nack as sinon.SinonStub).firstCall.args[2], false, 'requeue must be false');
            });

            it("should not throw when channel.nack fails on closed channel", async function() {
                const failingCallback = sandbox.stub().rejects(new Error('Handler failed'));
                const failingRetryManager = {
                    handleResult: sandbox.stub().rejects(new Error('Retry failed'))
                };
                const closedChannel = {
                    consume: sandbox.stub().resolves({ consumerTag: 'test-tag' }),
                    ack: sandbox.stub(),
                    nack: sandbox.stub().throws(new Error('Channel closed'))
                } as any;
                const processor = new MessageProcessor(mockConfig, failingCallback, failingRetryManager as any);
                await processor.startConsuming(closedChannel, mockChannelWrapper);

                const message: ConsumeMessage = {
                    content: Buffer.from(JSON.stringify({ CorrelationId: '123' })),
                    properties: {
                        headers: { TypeName: 'TestType' },
                        messageId: 'msg-3'
                    }
                } as any;

                const consumeHandler = closedChannel.consume.getCall(0).args[1];
                // Should not throw even though channel.nack throws
                await consumeHandler(message);
            });

            it("should nack with requeue=true when closing and message arrives", async function() {
                const processor = new MessageProcessor(mockConfig, mockConsumeCallback, mockRetryManager);
                await processor.startConsuming(mockChannel, mockChannelWrapper);
                processor.beginClosing();

                const message: ConsumeMessage = {
                    content: Buffer.from(JSON.stringify({ CorrelationId: '123' })),
                    properties: {
                        headers: { TypeName: 'TestType' },
                        messageId: 'msg-4'
                    }
                } as any;

                const consumeHandler = (mockChannel.consume as sinon.SinonStub).getCall(0).args[1];
                await consumeHandler(message);

                assert.isFalse(mockConsumeCallback.called, 'should not process message when closing');
                assert.isTrue((mockChannel.nack as sinon.SinonStub).calledOnce, 'should nack the message');
                assert.strictEqual((mockChannel.nack as sinon.SinonStub).firstCall.args[2], true, 'requeue must be true when closing');
            });
        });

        describe("getProcessingCount", function() {
            it("should return 0 when not processing", function() {
                assert.equal(messageProcessor.getProcessingCount(), 0);
            });
        });

        describe("waitForProcessing", function() {
            it("should resolve immediately when no messages processing", async function() {
                const startTime = Date.now();
                await messageProcessor.waitForProcessing(1000);
                const elapsed = Date.now() - startTime;
                assert.isBelow(elapsed, 100);
            });
        });
    });

    describe("RetryManager", function() {
        let retryManager: RetryManager;
        let mockChannelWrapper: any;

        beforeEach(function() {
            retryManager = new RetryManager(mockConfig);
            mockChannelWrapper = {
                sendToQueue: sandbox.stub().resolves()
            };
        });

        describe("handleResult", function() {
            it("should handle success result (send to audit if enabled)", async function() {
                mockConfig.amqpSettings.auditEnabled = true;
                retryManager = new RetryManager(mockConfig);

                const parsedMessage = { CorrelationId: '123', data: 'test' } as any;
                const rawMessage: ConsumeMessage = {
                    content: Buffer.from(JSON.stringify(parsedMessage)),
                    properties: {
                        headers: { TypeName: 'TestMessage' },
                        messageId: 'msg-123'
                    }
                } as any;

                await retryManager.handleResult(mockChannelWrapper, rawMessage, { success: true, parsedMessage });

                assert.isTrue(mockChannelWrapper.sendToQueue.calledWith(
                    mockConfig.amqpSettings.auditQueue,
                    sinon.match.instanceOf(Buffer),
                    sinon.match.any
                ));
                const sentContent = JSON.parse(mockChannelWrapper.sendToQueue.firstCall.args[1].toString());
                assert.strictEqual(sentContent.CorrelationId, '123');
            });

            it("should not send to audit when auditEnabled is false", async function() {
                mockConfig.amqpSettings.auditEnabled = false;
                retryManager = new RetryManager(mockConfig);

                const parsedMessage = { CorrelationId: '123' } as any;
                const rawMessage: ConsumeMessage = {
                    content: Buffer.from(JSON.stringify(parsedMessage)),
                    properties: { headers: {}, messageId: 'msg-123' }
                } as any;

                await retryManager.handleResult(mockChannelWrapper, rawMessage, { success: true, parsedMessage });

                assert.isFalse(mockChannelWrapper.sendToQueue.called);
            });

            it("should send to retry queue on failure when retries available", async function() {
                const parsedMessage = { CorrelationId: '123', data: 'test' } as any;
                const rawMessage: ConsumeMessage = {
                    content: Buffer.from(JSON.stringify(parsedMessage)),
                    properties: {
                        headers: { TypeName: 'TestMessage' },
                        messageId: 'msg-123'
                    }
                } as any;

                await retryManager.handleResult(mockChannelWrapper, rawMessage, { success: false, exception: new Error('Failed'), parsedMessage });

                assert.isTrue(mockChannelWrapper.sendToQueue.calledWith(
                    `${mockConfig.amqpSettings.queue.name}.Retries`
                ));
                const headers = mockChannelWrapper.sendToQueue.getCall(0).args[2].headers;
                assert.equal(headers.RetryCount, 1);
            });

            it("should send to error queue after max retries exceeded", async function() {
                const parsedMessage = { CorrelationId: '123' } as any;
                const rawMessage: ConsumeMessage = {
                    content: Buffer.from(JSON.stringify(parsedMessage)),
                    properties: {
                        headers: { TypeName: 'TestMessage', RetryCount: 3 },
                        messageId: 'msg-123'
                    }
                } as any;

                await retryManager.handleResult(mockChannelWrapper, rawMessage, { success: false, exception: new Error('Failed'), parsedMessage });

                assert.isTrue(mockChannelWrapper.sendToQueue.calledWith(
                    mockConfig.amqpSettings.errorQueue
                ));
            });

            it("should send directly to error queue if maxRetries is 0", async function() {
                mockConfig.amqpSettings.maxRetries = 0;
                retryManager = new RetryManager(mockConfig);

                const parsedMessage = { CorrelationId: '123' } as any;
                const rawMessage: ConsumeMessage = {
                    content: Buffer.from(JSON.stringify(parsedMessage)),
                    properties: { headers: {}, messageId: 'msg-123' }
                } as any;

                await retryManager.handleResult(mockChannelWrapper, rawMessage, { success: false, exception: new Error('Failed'), parsedMessage });

                assert.isTrue(mockChannelWrapper.sendToQueue.calledWith(
                    mockConfig.amqpSettings.errorQueue
                ));
            });

            it("should not mutate raw message headers", async function() {
                const parsedMessage = { CorrelationId: '123' } as any;
                const originalHeaders = { TypeName: 'TestMessage' };
                const rawMessage: ConsumeMessage = {
                    content: Buffer.from(JSON.stringify(parsedMessage)),
                    properties: {
                        headers: originalHeaders,
                        messageId: 'msg-123'
                    }
                } as any;

                await retryManager.handleResult(mockChannelWrapper, rawMessage, { success: false, exception: new Error('Failed'), parsedMessage });

                // Original headers should not have RetryCount set
                assert.isUndefined(originalHeaders.RetryCount);
            });
        });

        describe("handleFailure", function() {
            it("should increment RetryCount on retry", async function() {
                const parsedMessage = { CorrelationId: '123' } as any;
                const rawMessage: ConsumeMessage = {
                    content: Buffer.from(JSON.stringify(parsedMessage)),
                    properties: {
                        headers: { TypeName: 'TestMessage', RetryCount: 1 },
                        messageId: 'msg-123'
                    }
                } as any;

                await retryManager.handleResult(mockChannelWrapper, rawMessage, { success: false, exception: new Error('Failed'), parsedMessage });

                const headers = mockChannelWrapper.sendToQueue.getCall(0).args[2].headers;
                assert.equal(headers.RetryCount, 2);
            });

            it("should set Exception header in error queue", async function() {
                const error = new Error("Test error");
                const parsedMessage = { CorrelationId: '123' } as any;
                const rawMessage: ConsumeMessage = {
                    content: Buffer.from(JSON.stringify(parsedMessage)),
                    properties: {
                        headers: { TypeName: 'TestMessage', RetryCount: 3 },
                        messageId: 'msg-123'
                    }
                } as any;

                await retryManager.handleResult(mockChannelWrapper, rawMessage, { success: false, exception: error, parsedMessage });

                const headers = mockChannelWrapper.sendToQueue.getCall(0).args[2].headers;
                assert.include(String(headers.Exception), "Test error");
            });

            it("should preserve messageId when sending to queues", async function() {
                const parsedMessage = { CorrelationId: '123' } as any;
                const rawMessage: ConsumeMessage = {
                    content: Buffer.from(JSON.stringify(parsedMessage)),
                    properties: {
                        headers: { TypeName: 'TestMessage' },
                        messageId: 'original-msg-id'
                    }
                } as any;

                await retryManager.handleResult(mockChannelWrapper, rawMessage, { success: false, exception: new Error('Failed'), parsedMessage });

                const options = mockChannelWrapper.sendToQueue.getCall(0).args[2];
                assert.equal(options.messageId, 'original-msg-id');
            });
        });

        describe("RetryCount clamping", function() {
            it("should clamp negative RetryCount to 0", async function() {
                const parsedMessage = { CorrelationId: 'a' } as any;
                const rawMessage: ConsumeMessage = {
                    content: Buffer.from(JSON.stringify(parsedMessage)),
                    properties: {
                        headers: { TypeName: 'Test', RetryCount: -5 },
                        messageId: 'msg-neg'
                    }
                } as any;

                await retryManager.handleResult(mockChannelWrapper, rawMessage, {
                    success: false,
                    exception: new Error('fail'),
                    parsedMessage
                });

                const sentHeaders = mockChannelWrapper.sendToQueue.firstCall.args[2].headers;
                assert.strictEqual(sentHeaders.RetryCount, 1, 'should increment from clamped 0 to 1');
            });

            it("should clamp NaN RetryCount to 0", async function() {
                const parsedMessage = { CorrelationId: 'a' } as any;
                const rawMessage: ConsumeMessage = {
                    content: Buffer.from(JSON.stringify(parsedMessage)),
                    properties: {
                        headers: { TypeName: 'Test', RetryCount: 'garbage' },
                        messageId: 'msg-nan'
                    }
                } as any;

                await retryManager.handleResult(mockChannelWrapper, rawMessage, {
                    success: false,
                    exception: new Error('fail'),
                    parsedMessage
                });

                const sentHeaders = mockChannelWrapper.sendToQueue.firstCall.args[2].headers;
                assert.strictEqual(sentHeaders.RetryCount, 1);
            });
        });

        describe("sendToErrorQueue", function() {
            it("should log error before sending to error queue", async function() {
                const error = new Error("Processing failed");
                const parsedMessage = { CorrelationId: '123' } as any;
                const rawMessage: ConsumeMessage = {
                    content: Buffer.from(JSON.stringify(parsedMessage)),
                    properties: {
                        headers: { TypeName: 'TestMessage', RetryCount: 3 },
                        messageId: 'msg-123'
                    }
                } as any;

                await retryManager.handleResult(mockChannelWrapper, rawMessage, { success: false, exception: error, parsedMessage });

                assert.isTrue((mockConfig.logger?.error as any).calledWith(
                    'Message processing failed, sending to error queue',
                    error
                ));
            });
        });
    });
});
