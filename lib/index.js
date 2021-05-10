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
exports.Bus = void 0;
const settings_1 = __importDefault(require("./settings"));
const events_1 = __importDefault(require("events"));
const deepmerge_1 = __importDefault(require("deepmerge"));
const uuid_1 = require("uuid");
/** Class representing a the message bus. */
class Bus extends events_1.default {
    /**
     * Sets config and creates client
     * @constructor
     * @param {Object} config
     */
    constructor(config) {
        super();
        this.client = null;
        this.initialized = false;
        // EventEmitter functions
        this._on = this.on;
        this._off = this.off;
        this._emit = this.emit;
        this.on = (event, listener) => this._on(event, listener);
        this.off = (event, listener) => this._off(event, listener);
        this.emit = (event, ...args) => this._emit(event, args);
        this.id = uuid_1.v4();
        this.config = deepmerge_1.default(settings_1.default(), config);
        this.init = this.init.bind(this);
        this._consumeMessage = this._consumeMessage.bind(this);
        this.addHandler = this.addHandler.bind(this);
        this.removeHandler = this.removeHandler.bind(this);
        this.send = this.send.bind(this);
        this.publish = this.publish.bind(this);
        this._processHandlers = this._processHandlers.bind(this);
        this.isHandled = this.isHandled.bind(this);
        this.on('error', console.log);
        this.requestReplyCallbacks = {};
    }
    /**
     * Creates AMQP client and fires connected event when client has connected
     * @return {Promise}
     */
    init() {
        return new Promise((resolve, reject) => {
            this.client = new this.config.client(this.config, this._consumeMessage);
            this.client.on("error", ex => this.emit("error", ex));
            this.client.on("connection-error", (ex) => {
                this.emit("error", ...ex);
                reject(ex);
            });
            this.client.on("connected", () => {
                if (!this.initialized) {
                    this.initialized = true;
                    this.emit("connected");
                }
                resolve();
            });
            this.client.connect();
        });
    }
    /**
     * Starts consuming the message type and binds the callback to the message type.
     * @param {String} message
     * @param  {Function} callback
     */
    addHandler(message, callback) {
        var _a;
        var type = message.replace(/\./g, "");
        if (type !== "*") {
            (_a = this.client) === null || _a === void 0 ? void 0 : _a.consumeType(type);
        }
        this.config.handlers[message] = this.config.handlers[message] || [];
        this.config.handlers[message].push(callback);
    }
    /**
     * Removes the message type callback binding and stops listening for the message if there are no more callback
     * bindings.
     * @param {String} message
     * @param {Function} callback
     */
    removeHandler(message, callback) {
        var _a;
        if (this.config.handlers[message]) {
            this.config.handlers[message] = this.config
                .handlers[message]
                .filter(c => c !== callback);
            if (message !== "*" && (this.config.handlers[message] === undefined ||
                this.config.handlers[message].length === 0)) {
                (_a = this.client) === null || _a === void 0 ? void 0 : _a.removeType(message.replace(/\./g, ""));
            }
        }
    }
    /**
     * Checks if the message type is being handled by the Bus.
     * @param {String} message
     * @return {Boolean}
     */
    isHandled(message) {
        return this.config.handlers[message] !== undefined && this.config.handlers[message].length !== 0;
    }
    /**
     * Sends a command to the specified endpoint(s).
     * @param {String|Array} endpoint
     * @param {String} type
     * @param {Object} message
     * @param {Object|undefined} headers
     * @return {Promise}
     */
    send(endpoint, type, message, headers = {}) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            let result = yield this._processFilters(this.config.filters.outgoing, message, headers, type);
            if (!result) {
                return;
            }
            return (_a = this.client) === null || _a === void 0 ? void 0 : _a.send(endpoint, type, message, headers);
        });
    }
    /**
     * Publishes an event of the specified type.
     * @param {String} type
     * @param {Object} message
     * @param {Object|undefined} headers
     * @return {Promise}
     */
    publish(type, message, headers = {}) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            let result = yield this._processFilters(this.config.filters.outgoing, message, headers, type);
            if (!result) {
                return;
            }
            return (_a = this.client) === null || _a === void 0 ? void 0 : _a.publish(type, message, headers);
        });
    }
    /**
     * Sends a command to the specified endpoint(s) and waits for one or more replies.
     * The method behaves like a regular blocking RPC method.
     * @param {string|Array} endpoint
     * @param {string} type
     * @param {Object} message
     * @param {function} callback
     * @param {Object|undefined} headers
     */
    sendRequest(endpoint, type, message, callback, headers = {}) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            let messageId = uuid_1.v4();
            let endpoints = Array.isArray(endpoint) ? endpoint : [endpoint];
            let result = yield this._processFilters(this.config.filters.outgoing, message, headers, type);
            if (!result) {
                return;
            }
            this.requestReplyCallbacks[messageId] = {
                endpointCount: endpoints.length,
                processedCount: 0,
                callback
            };
            headers["RequestMessageId"] = messageId;
            return (_a = this.client) === null || _a === void 0 ? void 0 : _a.send(endpoint, type, message, headers);
        });
    }
    /**
     * Publishes an event and wait for replies.
     * @param {string} type
     * @param {Object} message
     * @param {function} callback
     * @param {int|null} expected
     * @param {int|null} timeout
     * @param {Object|null} headers
     * @return {Promise}
     */
    publishRequest(type, message, callback, expected = null, timeout = 10000, headers = {}) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            let messageId = uuid_1.v4();
            let result = yield this._processFilters(this.config.filters.outgoing, message, headers, type);
            if (!result) {
                return;
            }
            this.requestReplyCallbacks[messageId] = {
                endpointCount: expected === null ? -1 : expected,
                processedCount: 0,
                callback
            };
            headers["RequestMessageId"] = messageId;
            if (timeout !== null) {
                this.requestReplyCallbacks[messageId].timeout = setTimeout(() => {
                    if (this.requestReplyCallbacks[messageId]) {
                        clearTimeout(this.requestReplyCallbacks[messageId].timeout);
                        delete this.requestReplyCallbacks[messageId];
                    }
                }, timeout);
            }
            return (_a = this.client) === null || _a === void 0 ? void 0 : _a.publish(type, message, headers);
        });
    }
    /**
     * Callback called when consuming a message.  Calls handler callbacks.
     * @param  {Object} message
     * @param  {Object} headers
     * @param  {string} type
     * @return {Promise<Object>} result
     */
    _consumeMessage(message, headers, type) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                let process = yield this._processFilters(this.config.filters.before, message, headers, type);
                if (!process) {
                    return;
                }
                yield Promise.all([
                    ...this._processHandlers(message, headers, type),
                    this._processRequestReplies(message, headers, type)
                ]);
                process = yield this._processFilters(this.config.filters.after, message, headers, type);
                if (!process) {
                    return;
                }
            }
            catch (e) {
                this.emit("error", e);
                throw e;
            }
        });
    }
    _processFilters(filters, message, headers, type) {
        return __awaiter(this, void 0, void 0, function* () {
            for (var i = 0; i < filters.length; i++) {
                let result = yield filters[i](message, headers, type, this);
                if (result === false) {
                    return false;
                }
            }
            return true;
        });
    }
    /**
     * Finds all handlers interested in the message type and calls handler callback function.
     * @param  {Object} message
     * @param  {Object} headers
     * @param  {string} type
     * @return {List<Promise>}
     * @private
     */
    _processHandlers(message, headers, type) {
        let handlers = this.config.handlers[type] || [], promises = [];
        if (this.config.handlers["*"] !== undefined && this.config.handlers["*"] !== null) {
            handlers = [...handlers, ...this.config.handlers["*"]];
        }
        if (handlers.length > 0) {
            var replyCallback = this._getReplyCallback(headers);
            promises = handlers.map(h => h(message, headers, type, replyCallback));
        }
        return promises;
    }
    /**
     * Finds the callback passed to sendRequest or publishRequest and calls it.
     * @param  {Object} message
     * @param  {Object} headers
     * @param  {Object} type
     * @return {Promise}
     * @private
     */
    _processRequestReplies(message, headers, type) {
        let promise = null;
        if (headers["ResponseMessageId"]) {
            const responseId = headers["ResponseMessageId"];
            let configuration = this.requestReplyCallbacks[responseId];
            if (configuration) {
                promise = configuration.callback(message, headers, type);
                configuration.processedCount++;
                if (configuration.processedCount >= configuration.endpointCount) {
                    if (this.requestReplyCallbacks[responseId].timeout) {
                        clearTimeout(this.requestReplyCallbacks[responseId].timeout);
                    }
                    delete this.requestReplyCallbacks[responseId];
                }
            }
        }
        return promise;
    }
    /**
     * Returns a reply function to be used by handlers.  The reply function will set the ResponseMessageId in the
     * headers and send the reply back to the source address.
     * @param {Object} headers
     * @return {function(*=, *=)}
     * @private
     */
    _getReplyCallback(headers) {
        return (type, message) => {
            headers["ResponseMessageId"] = headers["RequestMessageId"];
            this.send(headers["SourceAddress"], type, message, headers);
        };
    }
    /**
     * Disposes of Bus resources.
     */
    close() {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            yield ((_a = this.client) === null || _a === void 0 ? void 0 : _a.close());
        });
    }
}
exports.Bus = Bus;
//# sourceMappingURL=index.js.map