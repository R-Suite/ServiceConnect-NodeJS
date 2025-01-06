"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const amqp_connection_manager_1 = __importDefault(require("amqp-connection-manager"));
const os_1 = __importDefault(require("os"));
const deepmerge_1 = __importDefault(require("deepmerge"));
const uuid_1 = require("uuid");
/** Class representing the rabbitMQ client. */
class default_1 {
    /**
     * Sets config and connects to RabbitMQ
     * @constructor
     * @param  {Object} config
     * @param (Function) consumeMessageCallback
     */
    constructor(config, consumeMessageCallback) {
        this.processing = 0;
        this.config = config;
        this.consumeMessageCallback = consumeMessageCallback;
        this._consumeMessage = this._consumeMessage.bind(this);
        this._createQueues = this._createQueues.bind(this);
        this.consumeType = this.consumeType.bind(this);
        this.removeType = this.removeType.bind(this);
        this.publish = this.publish.bind(this);
        this.send = this.send.bind(this);
        this._getHeaders = this._getHeaders.bind(this);
        this._processMessage = this._processMessage.bind(this);
        this.close = this.close.bind(this);
    }
    /**
     *
     * Creates connection, creates channel and then sets up RabbitMQ queues and exchanges.
     */
    connect() {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            try {
                let options = {};
                if (this.config.amqpSettings.ssl) {
                    options = (0, deepmerge_1.default)(options, this.config.amqpSettings.ssl);
                }
                let hosts = Array.isArray(this.config.amqpSettings.host) ? this.config.amqpSettings.host : [this.config.amqpSettings.host];
                this.connection = amqp_connection_manager_1.default.connect(hosts, { connectionOptions: options });
                this.connection.on('connect', () => { var _a; return (_a = this.config.logger) === null || _a === void 0 ? void 0 : _a.info(`Connected ${this.config.amqpSettings.queue.name}`); });
                this.connection.on('disconnect', (err) => { var _a; return (_a = this.config.logger) === null || _a === void 0 ? void 0 : _a.error(`Disconnected ${this.config.amqpSettings.queue.name}`, err); });
                this.connection.on('connectFailed', (err) => { var _a; return (_a = this.config.logger) === null || _a === void 0 ? void 0 : _a.error(`Connection failed ${this.config.amqpSettings.queue.name}`, err); });
                this.connection.on('blocked', (err) => { var _a; return (_a = this.config.logger) === null || _a === void 0 ? void 0 : _a.error(`Blocked by broker ${this.config.amqpSettings.queue.name}`, err); });
                yield new Promise((resolve, reject) => {
                    var _a, _b, _c;
                    try {
                        (_a = this.config.logger) === null || _a === void 0 ? void 0 : _a.info("Building RabbitMQ channel");
                        (_b = this.connection) === null || _b === void 0 ? void 0 : _b.createChannel({});
                        this.channel = (_c = this.connection) === null || _c === void 0 ? void 0 : _c.createChannel({
                            json: true,
                            setup: (channel) => __awaiter(this, void 0, void 0, function* () {
                                var _d;
                                yield channel.prefetch(this.config.amqpSettings.prefetch);
                                (_d = this.config.logger) === null || _d === void 0 ? void 0 : _d.info("RabbitMQ channel created.");
                                yield this._createQueues(channel);
                                resolve();
                            })
                        });
                    }
                    catch (error) {
                        reject(error);
                    }
                });
            }
            catch (error) {
                (_a = this.config.logger) === null || _a === void 0 ? void 0 : _a.error("Error connecting to rabbitmq", error);
                throw error;
            }
        });
    }
    /**
     * Creates host queue, retry queue and error queue.  It then sets up handler mappings and begins consuming messages.
     * The connected event is fired after consuming has begun.
     */
    _createQueues(channel) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // create queue
                let queueOpts = {
                    durable: this.config.amqpSettings.queue.durable,
                    exclusive: this.config.amqpSettings.queue.exclusive,
                    autoDelete: this.config.amqpSettings.queue.autoDelete,
                    arguments: this.config.amqpSettings.queue.arguments
                };
                if (this.config.amqpSettings.queue.maxPriority !== null && this.config.amqpSettings.queue.maxPriority !== undefined) {
                    queueOpts.maxPriority = this.config.amqpSettings.queue.maxPriority;
                }
                (_a = this.config.logger) === null || _a === void 0 ? void 0 : _a.info(`Creating queue ${this.config.amqpSettings.queue.name}.`);
                yield channel.assertQueue(this.config.amqpSettings.queue.name, queueOpts);
                // bind queue to message types      
                (_b = this.config.logger) === null || _b === void 0 ? void 0 : _b.info(`Binding message handlers to queue.`);
                for (var key in this.config.handlers) {
                    let type = key.replace(/\./g, "");
                    yield channel.assertExchange(type, 'fanout', {
                        durable: true
                    });
                    yield channel.bindQueue(this.config.amqpSettings.queue.name, type, '');
                }
                // Create retry queue if retries are enabled
                if (this.config.amqpSettings.maxRetries > 0) {
                    // Create dead letter exchange
                    (_c = this.config.logger) === null || _c === void 0 ? void 0 : _c.info(`Creating retry queue.`);
                    let deadLetterExchange = this.config.amqpSettings.queue.name + ".Retries.DeadLetter";
                    yield channel.assertExchange(deadLetterExchange, 'direct', {
                        durable: true
                    });
                    let retryQueue = this.config.amqpSettings.queue.name + ".Retries";
                    yield channel.assertQueue(retryQueue, {
                        durable: this.config.amqpSettings.queue.durable,
                        arguments: Object.assign({ "x-dead-letter-exchange": deadLetterExchange, "x-message-ttl": this.config.amqpSettings.retryDelay }, ((_d = this.config.amqpSettings.queue.retryQueueArguments) !== null && _d !== void 0 ? _d : {}))
                    });
                    yield channel.bindQueue(this.config.amqpSettings.queue.name, deadLetterExchange, retryQueue);
                }
                // configure error exchange
                (_e = this.config.logger) === null || _e === void 0 ? void 0 : _e.info(`Configuring Error queue.`);
                yield channel.assertExchange(this.config.amqpSettings.errorQueue, 'direct', {
                    durable: false
                });
                // create error queue
                yield channel.assertQueue(this.config.amqpSettings.errorQueue, {
                    durable: true,
                    autoDelete: false,
                    arguments: Object.assign({}, ((_f = this.config.amqpSettings.queue.utilityQueueArguments) !== null && _f !== void 0 ? _f : {}))
                });
                if (this.config.amqpSettings.auditEnabled) {
                    (_g = this.config.logger) === null || _g === void 0 ? void 0 : _g.info(`Configuring audit queue.`);
                    // configure audit exchange
                    yield channel.assertExchange(this.config.amqpSettings.auditQueue, 'direct', {
                        durable: false
                    });
                    // create error audit
                    yield channel.assertQueue(this.config.amqpSettings.auditQueue, {
                        durable: true,
                        autoDelete: false,
                        arguments: Object.assign({}, ((_h = this.config.amqpSettings.queue.utilityQueueArguments) !== null && _h !== void 0 ? _h : {}))
                    });
                }
                (_j = this.config.logger) === null || _j === void 0 ? void 0 : _j.info(`Binding consume message callback to queue.`);
                yield channel.consume(this.config.amqpSettings.queue.name, this._consumeMessage, {
                    noAck: this.config.amqpSettings.queue.noAck
                });
            }
            catch (error) {
                (_k = this.config.logger) === null || _k === void 0 ? void 0 : _k.error("Error configuring rabbitmq message bus", error);
                throw error;
            }
        });
    }
    /**
     * Starts consuming the message type.  Creates a durable exchange named @message of type fanout.
     * Binds the clients queue to the exchange.
     * @param {string} type
     */
    consumeType(type) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            yield ((_a = this.channel) === null || _a === void 0 ? void 0 : _a.addSetup((channel) => {
                return Promise.all([
                    channel.assertExchange(type, 'fanout', { durable: true }),
                    channel.bindQueue(this.config.amqpSettings.queue.name, type, '')
                ]);
            }));
        });
    }
    /**
     * Stops listening for the message.  Unbinds the exchange named @type from the client queue.
     * @param {String} type
     */
    removeType(type) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            yield ((_a = this.channel) === null || _a === void 0 ? void 0 : _a.removeSetup((channel) => {
                return channel.unbindQueue(this.config.amqpSettings.queue.name, type, "");
            }));
        });
    }
    /**
     * Sends a command to the specified endpoint(s).
     * @param {String|Array} endpoint
     * @param {String} type
     * @param {Object} message
     * @param  Object|undefined} headers
     */
    send(endpoint, type, message, headers = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            let endpoints = Array.isArray(endpoint) ? endpoint : [endpoint];
            yield Promise.all(endpoints.map(ep => {
                var _a;
                let messageHeaders = this._getHeaders(type, headers, ep, "Send");
                let options = { headers: messageHeaders, messageId: messageHeaders.MessageId };
                if (messageHeaders.hasOwnProperty("Priority")) {
                    options.priority = messageHeaders.Priority;
                }
                return (_a = this.channel) === null || _a === void 0 ? void 0 : _a.sendToQueue(ep, message, options);
            }));
        });
    }
    /**
     * Published an event of the specified type.
     * @param {String} type
     * @param {Object} message
     * @param {Object|undefined} headers
     */
    publish(type, message, headers = {}) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            let messageHeaders = this._getHeaders(type, headers, this.config.amqpSettings.queue.name, "Publish");
            let options = { headers: messageHeaders, messageId: messageHeaders.MessageId };
            if (messageHeaders.hasOwnProperty("Priority")) {
                options.priority = messageHeaders.Priority;
            }
            yield ((_a = this.channel) === null || _a === void 0 ? void 0 : _a.addSetup((channel) => {
                return channel.assertExchange(type.replace(/\./g, ""), 'fanout', { durable: true });
            }).then(() => {
                var _a;
                return (_a = this.channel) === null || _a === void 0 ? void 0 : _a.publish(type.replace(/\./g, ""), '', message, options);
            }));
        });
    }
    /**
     * Creates a object containing the standard message headers that need to be sent with all messages.
     * @param {String} type
     * @param {Object} headers
     * @param {String} queue
     * @param {String} messageType
     * @return {Object} headers
     */
    _getHeaders(type, headers, queue, messageType) {
        headers = (0, deepmerge_1.default)({}, headers || {});
        if (!headers.DestinationAddress)
            headers.DestinationAddress = queue;
        if (!headers.MessageId)
            headers.MessageId = (0, uuid_1.v4)();
        if (!headers.MessageType)
            headers.MessageType = messageType;
        if (!headers.SourceAddress)
            headers.SourceAddress = this.config.amqpSettings.queue.name;
        if (!headers.TimeSent)
            headers.TimeSent = new Date().toISOString();
        if (!headers.TypeName)
            headers.TypeName = type;
        if (!headers.TypeName)
            headers.FullTypeName = type;
        if (!headers.ConsumerType)
            headers.ConsumerType = 'RabbitMQ';
        if (!headers.Language)
            headers.Language = 'Javascript';
        return headers;
    }
    /**
     * Callback called by RabbitMQ when consuming a message.  Calls the consumeMessage callback passed into the client
     * constructor.  If there is an exception the message is sent to the retry queue.  If an exception occurs and the
     * message has been retried the max number of times then the message is sent to the error queue.  If auditing is
     * enabled a copy of the message is sent to the audit queue. Acks the message at the end if noAck is false.
     * @param  {Object} rawMessage
     */
    _consumeMessage(rawMessage) {
        var _a, _b, _c;
        return __awaiter(this, void 0, void 0, function* () {
            if (rawMessage === null)
                return;
            this.processing++;
            try {
                if (!rawMessage.properties.headers.TypeName) {
                    (_a = this.config.logger) === null || _a === void 0 ? void 0 : _a.error("Message does not contain TypeName");
                    return;
                }
                yield this._processMessage(rawMessage);
            }
            catch (error) {
                (_b = this.config.logger) === null || _b === void 0 ? void 0 : _b.error("Error processing message", error);
            }
            finally {
                if (!this.config.amqpSettings.queue.noAck) {
                    (_c = this.channel) === null || _c === void 0 ? void 0 : _c.ack(rawMessage);
                }
                this.processing--;
            }
        });
    }
    /**
     * Processes the RabbitMQ message.  Calls the consumeMessage callback passed into the client
     * constructor.  If there is an exception the message is sent to the retry queue.  If an exception occurs and the
     * message has been retried the max number of times then the message is sent to the error queue.  If auditing is
     * enabled a copy of the message is sent to the audit queue.
     * @param  {Object} rawMessage
     */
    _processMessage(rawMessage) {
        var _a, _b, _c, _d;
        return __awaiter(this, void 0, void 0, function* () {
            let result = null, headers = rawMessage.properties.headers;
            try {
                headers.TimeReceived = headers.TimeReceived || new Date().toISOString();
                headers.DestinationMachine = headers.DestinationMachine || os_1.default.hostname();
                headers.DestinationAddress = headers.DestinationAddress || this.config.amqpSettings.queue.name;
                let message = JSON.parse(rawMessage.content.toString());
                try {
                    yield this.consumeMessageCallback(message, headers, headers.TypeName);
                }
                catch (e) {
                    if (e === null || e === undefined ||
                        (e !== null && e != undefined && typeof e !== 'object') ||
                        (e !== null && e != undefined && typeof e === 'object' && e.retry !== false)) {
                        result = {
                            exception: e,
                            success: false
                        };
                    }
                }
                headers.TimeProcessed = headers.TimeProcessed || new Date().toISOString();
                // forward to audit queue is audit is enabled
                if (result === null && this.config.amqpSettings.auditEnabled) {
                    yield ((_a = this.channel) === null || _a === void 0 ? void 0 : _a.sendToQueue(this.config.amqpSettings.auditQueue, JSON.parse(rawMessage.content.toString()), {
                        headers: headers,
                        messageId: rawMessage.properties.messageId
                    }));
                }
            }
            catch (ex) {
                result = {
                    exception: ex,
                    success: false
                };
            }
            if (((_b = this.config.amqpSettings) === null || _b === void 0 ? void 0 : _b.maxRetries) !== 0) {
                if (result !== null) {
                    let retryCount = 0;
                    if (headers.RetryCount !== undefined) {
                        retryCount = headers.RetryCount;
                    }
                    if (retryCount < this.config.amqpSettings.maxRetries) {
                        retryCount++;
                        headers.RetryCount = retryCount;
                        yield ((_c = this.channel) === null || _c === void 0 ? void 0 : _c.sendToQueue(this.config.amqpSettings.queue.name + ".Retries", JSON.parse(rawMessage.content.toString()), {
                            headers: headers,
                            messageId: rawMessage.properties.messageId
                        }));
                    }
                    else {
                        headers.Exception = result.exception;
                        yield ((_d = this.channel) === null || _d === void 0 ? void 0 : _d.sendToQueue(this.config.amqpSettings.errorQueue, JSON.parse(rawMessage.content.toString()), {
                            headers: headers,
                            messageId: rawMessage.properties.messageId
                        }));
                    }
                }
            }
        });
    }
    /**
     * Closes RabbitMQ channel.
     */
    close() {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const channelObj = this.channel;
            if (this.config.amqpSettings.maxRetries !== 0 && this.config.amqpSettings.queue.autoDelete) {
                yield channelObj._channel.deleteQueue(this.config.amqpSettings.queue.name + ".Retries");
            }
            // Stop consuming messages.
            yield channelObj._channel.cancel(Object.keys(channelObj._channel.consumers)[0]);
            // Wait until all messages have been processed.
            let timeout = 0;
            while (this.processing !== 0 && timeout < 6000) {
                yield wait(100);
                timeout++;
            }
            // close channel
            yield channelObj._channel.close();
            // Close connection
            yield ((_a = this.connection) === null || _a === void 0 ? void 0 : _a.close());
        });
    }
    isConnected() {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            return (_b = (_a = this.connection) === null || _a === void 0 ? void 0 : _a.isConnected()) !== null && _b !== void 0 ? _b : false;
        });
    }
}
exports.default = default_1;
function wait(time) {
    return new Promise((resolve, _) => {
        setTimeout(() => resolve(), time);
    });
}
//# sourceMappingURL=rabbitMQ.js.map