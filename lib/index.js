'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.Bus = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _settings = require('./settings');

var _settings2 = _interopRequireDefault(_settings);

var _utils = require('./utils');

var _events = require('events');

var _events2 = _interopRequireDefault(_events);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/** Class representing a the message bus. */
var Bus = exports.Bus = function (_EventEmitter) {
    _inherits(Bus, _EventEmitter);

    /**
     * Sets config and creates client
     * @constructor
     * @param  {Object} config
     */
    function Bus(config) {
        _classCallCheck(this, Bus);

        var _this = _possibleConstructorReturn(this, (Bus.__proto__ || Object.getPrototypeOf(Bus)).call(this));

        _this.id = (0, _utils.guid)();
        _this.config = (0, _utils.mergeDeep)((0, _settings2.default)(), config);
        _this._consumeMessage = _this._consumeMessage.bind(_this);
        _this.addHandler = _this.addHandler.bind(_this);
        _this.removeHandler = _this.removeHandler.bind(_this);
        _this.send = _this.send.bind(_this);
        _this.publish = _this.publish.bind(_this);
        _this._processHandlers = _this._processHandlers.bind(_this);
        _this.isHandled = _this.isHandled.bind(_this);
        _this.on('error', console.log);
        _this.requestReplyCallbacks = {};
        return _this;
    }

    /**
     * Creates AMQP client and fires connected event when client has connected
     */


    _createClass(Bus, [{
        key: 'init',
        value: function init(cb) {
            var _this2 = this;

            this.client = new this.config.client(this.config, this._consumeMessage);
            this.client.connect();
            this.client.on("connected", function () {
                _this2.emit("connected");
                if (cb) cb();
            });
            this.client.on("error", function (ex) {
                return _this2.emit("error", ex);
            });
        }

        /**
         * Starts consuming the message type and binds the callback to the message type.
         * @param {String} message
         * @param  {Function} callback
         */

    }, {
        key: 'addHandler',
        value: function addHandler(message, callback) {
            var type = message.replace(/\./g, "");
            if (type !== "*") {
                this.client.consumeType(type);
            }
            this.config.handlers[message] = this.config.handlers[message] || [];
            this.config.handlers[message].push(callback);
        }

        /**
         * Removes the message type callback binding and stops listening for the message if there are no more callback
         * bindings.
         * @param {String} message
         * @param  {Function} callback
         */

    }, {
        key: 'removeHandler',
        value: function removeHandler(message, callback) {
            if (this.config.handlers[message]) {
                this.config.handlers[message] = this.config.handlers[message].filter(function (c) {
                    return c !== callback;
                });

                if (message !== "*" && (this.config.handlers[message] === undefined || this.config.handlers[message].length === 0)) {
                    this.client.removeType(message.replace(/\./g, ""));
                }
            }
        }

        /**
         * Checks if the message type is being handled by the Bus.
         * @param {String} message
         * @return {Boolean}
         */

    }, {
        key: 'isHandled',
        value: function isHandled(message) {
            return this.config.handlers[message] !== undefined && this.config.handlers[message].length !== 0;
        }

        /**
         * Sends a command to the specified endpoint(s).
         * @param {String|Array} endpoint
         * @param  {String} type
         * @param  {Object} message
         * @param  {Object|undefined} headers
         */

    }, {
        key: 'send',
        value: function send(endpoint, type, message) {
            var headers = arguments.length <= 3 || arguments[3] === undefined ? {} : arguments[3];

            this.client.send(endpoint, type, message, headers);
        }

        /**
         * Published an event of the specified type.
         * @param  {String} type
         * @param  {Object} message
         * @param  {Object|undefined} headers
         */

    }, {
        key: 'publish',
        value: function publish(type, message) {
            var headers = arguments.length <= 2 || arguments[2] === undefined ? {} : arguments[2];

            this.client.publish(type, message, headers);
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

    }, {
        key: 'sendRequest',
        value: function sendRequest(endpoint, type, message, callback) {
            var headers = arguments.length <= 4 || arguments[4] === undefined ? {} : arguments[4];

            var messageId = (0, _utils.guid)();

            var endpoints = Array.isArray(endpoint) ? endpoint : [endpoint];

            this.requestReplyCallbacks[messageId] = {
                endpointCount: endpoints.length,
                processedCount: 0,
                callback: callback
            };
            headers["RequestMessageId"] = messageId;
            this.client.send(endpoint, type, message, headers);
        }

        /**
         * Publishes an event and wait for replies.
         * @param {string} type
         * @param {Object} message
         * @param {function} callback
         * @param {int|null} expected
         * @param {int|null} timeout
         * @param {Object|null} headers
         */

    }, {
        key: 'publishRequest',
        value: function publishRequest(type, message, callback) {
            var expected = arguments.length <= 3 || arguments[3] === undefined ? null : arguments[3];

            var _this3 = this;

            var timeout = arguments.length <= 4 || arguments[4] === undefined ? 10000 : arguments[4];
            var headers = arguments.length <= 5 || arguments[5] === undefined ? {} : arguments[5];

            var messageId = (0, _utils.guid)();

            this.requestReplyCallbacks[messageId] = {
                endpointCount: expected === null ? -1 : expected,
                processedCount: 0,
                callback: callback
            };
            headers["RequestMessageId"] = messageId;

            this.client.publish(type, message, headers);

            if (timeout !== null) {
                this.requestReplyCallbacks[messageId].timeout = setTimeout(function () {
                    if (_this3.requestReplyCallbacks[messageId]) {
                        clearTimeout(_this3.requestReplyCallbacks[messageId].timeout);
                        delete _this3.requestReplyCallbacks[messageId];
                    }
                }, timeout);
            }
        }

        /**
         * Callback called when consuming a message.  Calls handler callbacks.
         * @param  {Object} message
         * @param  {Object} headers
         * @param  {string} type
         * @return  {Object} result
         */

    }, {
        key: '_consumeMessage',
        value: function _consumeMessage(message, headers, type) {
            var result = {
                success: true
            };
            try {
                this._processHandlers(message, headers, type);
                this._processRequestReplies(message, headers, type);
            } catch (e) {
                result = {
                    exception: e,
                    success: false
                };
                this.emit("error", e);
            }

            return result;
        }

        /**
         * Finds all handlers interested in the message type and calls handler callback function.
         * @param  {Object} message
         * @param  {Object} headers
         * @param  {string} type
         */

    }, {
        key: '_processHandlers',
        value: function _processHandlers(message, headers, type) {
            var handlers = this.config.handlers[type] || [];

            if (this.config.handlers["*"] !== undefined && this.config.handlers["*"] !== null) {
                handlers = [].concat(_toConsumableArray(handlers), _toConsumableArray(this.config.handlers["*"]));
            }

            if (handlers.length > 0) {
                var replyCallback = this._getReplyCallback(headers);
                handlers.map(function (handler) {
                    return handler(message, headers, type, replyCallback);
                });
            }
        }

        /**
         * Finds the callback passed to sendRequest or publishRequest and calls it.
         * @param  {Object} message
         * @param  {Object} headers
         * @param  {Object} type
         */

    }, {
        key: '_processRequestReplies',
        value: function _processRequestReplies(message, headers, type) {
            if (headers["ResponseMessageId"]) {
                var configuration = this.requestReplyCallbacks[headers["ResponseMessageId"]];
                if (configuration) {
                    configuration.callback(message, type, headers);
                    configuration.processedCount++;
                    if (configuration.processedCount >= configuration.endpointCount) {
                        if (this.requestReplyCallbacks[headers["ResponseMessageId"]].timeout) {
                            clearTimeout(this.requestReplyCallbacks[headers["ResponseMessageId"]].timeout);
                        }
                        delete this.requestReplyCallbacks[headers["ResponseMessageId"]];
                    }
                }
            }
        }

        /**
         * Returns a reply function to be used by handlers.  The reply function will set the ResponseMessageId in the
         * headers and send the reply back to the source address.
         * @param {Object} headers
         * @return {function(*=, *=)}
         * @private
         */

    }, {
        key: '_getReplyCallback',
        value: function _getReplyCallback(headers) {
            var _this4 = this;

            return function (type, message) {
                headers["ResponseMessageId"] = headers["RequestMessageId"];
                _this4.send(headers["SourceAddress"], type, message, headers);
            };
        }

        /**
         * Disposes of Bus resources.
         */

    }, {
        key: 'close',
        value: function close() {
            this.client.close();
        }
    }]);

    return Bus;
}(_events2.default);
//# sourceMappingURL=index.js.map