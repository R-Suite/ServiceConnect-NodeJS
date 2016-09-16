'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.Bus = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _settings = require('./settings');

var _settings2 = _interopRequireDefault(_settings);

var _utils = require('./utils');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/** Class representing a the message bus. */
var Bus = exports.Bus = function () {

    /**
     * Sets config and creates client
     * @constructor
     * @param  {Object} config
     */
    function Bus(config) {
        _classCallCheck(this, Bus);

        this.config = (0, _utils.mergeDeep)(_settings2.default, config);
        this._consumeMessage = this._consumeMessage.bind(this);
        this.on = this.on.bind(this);
        this.off = this.off.bind(this);
        this.send = this.send.bind(this);
        this.publish = this.publish.bind(this);
        this._processHandlers = this._processHandlers.bind(this);
        this._createClient();
    }

    /**
     * Creates AMQP client and fires connected event when client has connected
     */


    _createClass(Bus, [{
        key: '_createClient',
        value: function _createClient() {
            this.client = new this.config.client(this.config, this._consumeMessage);
            this.client.connect();
        }

        /**
         * Starts consuming the message type and binds the callback to the message type.
         * @param {String} message
         * @param  {Function} callback
         */

    }, {
        key: 'on',
        value: function on(message, callback) {
            var type = message.replace(/\./g, "");
            this.client.consumeType(type);
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
        key: 'off',
        value: function off(message, callback) {
            this.config.handlers[message] = this.config.handlers[message].filter(function (c) {
                return c !== callback;
            });

            if (this.config.handlers[message] === undefined || this.config.handlers[message].length === 0) {
                this.client.removeType(message.replace(/\./g, ""));
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
         * Callback called when consuming a message.  Calls handler callbacks.
         * @param  {Object} message
         * @param  {Object} headers
         * @param  {Object} type
         * @return  {Object} result
         */

    }, {
        key: '_consumeMessage',
        value: function _consumeMessage(message, headers, type) {
            var result = void 0;
            try {
                result = this._processHandlers(message, headers, type);
            } catch (ex) {
                result = {
                    exception: ex,
                    success: false
                };
            }

            return result;
        }

        /**
         * Finds all handlers interested in the message type and calls handler callback function.
         * @param  {Object} message
         * @param  {Object} headers
         * @param  {String} type
         * @return {Object} result
         */

    }, {
        key: '_processHandlers',
        value: function _processHandlers(message, headers, type) {
            var _this = this;

            var handlers = this.config.handlers[type],
                result = { success: true };
            if (handlers) {
                handlers.map(function (handler) {
                    try {
                        handler(message, headers, type);
                    } catch (e) {
                        result.success = false;
                        result.exception = e;
                        _this.config.events.error(e);
                    }
                });
            }
            return result;
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
}();
//# sourceMappingURL=index.js.map