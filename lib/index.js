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

        _this.config = (0, _utils.mergeDeep)(_settings2.default, config);
        _this._consumeMessage = _this._consumeMessage.bind(_this);
        _this.addHandler = _this.addHandler.bind(_this);
        _this.removeHandler = _this.removeHandler.bind(_this);
        _this.send = _this.send.bind(_this);
        _this.publish = _this.publish.bind(_this);
        _this._processHandlers = _this._processHandlers.bind(_this);
        _this.on('error', console.log);
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
        key: 'removeHandler',
        value: function removeHandler(message, callback) {
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
            var _this3 = this;

            var handlers = this.config.handlers[type],
                result = { success: true };
            if (handlers) {
                handlers.map(function (handler) {
                    try {
                        handler(message, headers, type);
                    } catch (e) {
                        result.success = false;
                        result.exception = e;
                        _this3.emit("error", e);
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
}(_events2.default);
//# sourceMappingURL=index.js.map