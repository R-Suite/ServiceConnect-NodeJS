'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _utils = require('../utils');

var _callback_api = require('amqplib/callback_api');

var _callback_api2 = _interopRequireDefault(_callback_api);

var _os = require('os');

var _os2 = _interopRequireDefault(_os);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/** Class representing the rabbitMQ client. */
var Client = function () {

    /**
     * Sets config and connects to RabbitMQ
     * @constructor
     * @param  {Object} config
     * @param (function) consumeMessageCallback
     */
    function Client(config, consumeMessageCallback) {
        _classCallCheck(this, Client);

        this.config = config;
        this.consumeMessageCallback = consumeMessageCallback;
        this._consumeMessage = this._consumeMessage.bind(this);
        this._createQueues = this._createQueues.bind(this);
        this.consumeType = this.consumeType.bind(this);
        this.removeType = this.removeType.bind(this);
        this.publish = this.publish.bind(this);
        this.send = this.send.bind(this);
        this.publish = this.publish.bind(this);
        this._getHeaders = this._getHeaders.bind(this);
        this._consumeMessage = this._consumeMessage.bind(this);
        this._processMessage = this._processMessage.bind(this);
        this.close = this.close.bind(this);
    }

    /**
     *
     * Creates connection, creates channel and then sets up RabbitMQ queues and exchanges.
     */


    _createClass(Client, [{
        key: 'connect',
        value: function connect() {
            var _this = this;

            var options = {};
            if (this.config.amqpSettings.ssl) {
                options = (0, _utils.mergeDeep)(options, this.config.amqpSettings.ssl);
            }

            _callback_api2.default.connect(this.config.amqpSettings.host, options, function (err, conn) {
                if (err) {
                    _this.config.events.error(err);
                    return;
                }
                _this.connection = conn;
                _this.connection.createChannel(function (err, channel) {
                    if (err) {
                        _this.config.events.error(err);
                        return;
                    }
                    _this.channel = channel;
                    _this._createQueues();
                });
            });
        }

        /**
         * Creates host queue, retry queue and error queue.  It then sets up handler mappings and begins consuming messages.
         * The connected event is fired after consuming has begun.
         */

    }, {
        key: '_createQueues',
        value: function _createQueues() {
            console.info("Connection ready");
            console.info("Creating queue " + this.config.amqpSettings.queue.name);

            // create queue
            this.channel.assertQueue(this.config.amqpSettings.queue.name, {
                durable: this.config.amqpSettings.queue.durable,
                exclusive: this.config.amqpSettings.queue.exclusive,
                autoDelete: this.config.amqpSettings.queue.autoDelete
            });
            console.info(this.config.amqpSettings.queue.name + " queue created.");

            // bind queue to message types
            for (var key in this.config.handlers) {
                var type = key.replace(/\./g, "");

                this.channel.assertExchange(type, 'fanout', {
                    durable: true
                });

                this.channel.bindQueue(this.config.amqpSettings.queue.name, type, '');

                console.info("Bound " + this.config.amqpSettings.queue.name + " to exchange " + key);
            }

            // Create dead letter exchange
            var deadLetterExchange = this.config.amqpSettings.queue.name + ".Retries.DeadLetter";
            this.channel.assertExchange(deadLetterExchange, 'fanout', {
                durable: true
            });

            // Create retry queue
            var retryQueue = this.config.amqpSettings.queue.name + ".Retries";
            console.info("Creating queue " + retryQueue);
            this.channel.assertQueue(retryQueue, {
                durable: this.config.amqpSettings.queue.durable,
                arguments: {
                    "x-dead-letter-exchange": deadLetterExchange,
                    "x-message-ttl": this.config.amqpSettings.retryDelay
                }
            });

            console.info(retryQueue + " queue created.");
            this.channel.bindQueue(this.config.amqpSettings.queue.name, deadLetterExchange, '');

            // configure error exchange
            this.channel.assertExchange(this.config.amqpSettings.errorQueue, 'direct', {
                durable: true
            });

            // create error queue
            console.info("Creating queue " + this.config.amqpSettings.errorQueue);
            this.channel.assertQueue(this.config.amqpSettings.errorQueue, {
                durable: true,
                autoDelete: false
            });

            console.info(this.config.amqpSettings.errorQueue + " queue created.");

            if (this.config.amqpSettings.auditEnabled) {
                // configure audit exchange
                this.channel.assertExchange(this.config.amqpSettings.auditQueue, 'direct', {
                    durable: true
                });

                // create error audit
                console.info("Creating queue " + this.config.amqpSettings.auditQueue);
                this.channel.assertQueue(this.config.amqpSettings.auditQueue, {
                    durable: true,
                    autoDelete: false
                });
            }

            this.channel.consume(this.config.amqpSettings.queue.name, this._consumeMessage, {
                noAck: this.config.amqpSettings.queue.noAck
            });

            this.config.events.connected();
        }

        /**
         * Starts consuming the message type.  Creates a durable exchange named @message of type fanout.
         * Binds the clients queue to the exchange.
         * @param {String} message
         * @param  {Function} callback
         */

    }, {
        key: 'consumeType',
        value: function consumeType(type) {
            this.channel.assertExchange(type, 'fanout', {
                durable: true
            });
            this.channel.bindQueue(this.config.amqpSettings.queue.name, type, '');
        }

        /**
         * Stops listening for the message.  Unbinds the exchange named @type from the client queue.
         * @param {String} type
         */

    }, {
        key: 'removeType',
        value: function removeType(type) {
            this.channel.unbindQueue(this.config.amqpSettings.queue.name, type);
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
            var _this2 = this;

            var headers = arguments.length <= 3 || arguments[3] === undefined ? {} : arguments[3];

            var endpoints = Array.isArray(endpoint) ? endpoint : [endpoint];
            endpoints.map(function (ep) {
                var messageHeaders = _this2._getHeaders(type, headers, ep, "Send");
                _this2.channel.sendToQueue(ep, new Buffer(JSON.stringify(message), "utf-8"), { headers: messageHeaders, messageId: messageHeaders.MessageId });
            });
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

            var messageHeaders = this._getHeaders(type, headers, this.config.amqpSettings.queue.name, "Publish");
            this.channel.assertExchange(type.replace(/\./g, ""), 'fanout', {
                durable: true
            });
            this.channel.publish(type.replace(/\./g, ""), '', new Buffer(JSON.stringify(message), "utf-8"), { headers: messageHeaders, messageId: messageHeaders.MessageId });
        }

        /**
         * Creates a object containing the standard message headers that need to be sent with all messages.
         * @param  {String} type
         * @param  {Object} headers
         * @param  {String} queue
         * @param  {String} messageType
         * @return  {Object} headers
         */

    }, {
        key: '_getHeaders',
        value: function _getHeaders(type, headers, queue, messageType) {
            headers = (0, _utils.mergeDeep)({}, headers || {});
            if (!headers.DestinationAddress) headers.DestinationAddress = queue;
            if (!headers.MessageId) headers.MessageId = (0, _utils.guid)();
            if (!headers.MessageType) headers.MessageType = messageType;
            if (!headers.SourceAddress) headers.SourceAddress = this.config.amqpSettings.queue.name;
            if (!headers.TimeSent) headers.TimeSent = new Date().toISOString();
            if (!headers.TypeName) headers.TypeName = type;
            if (!headers.ConsumerType) headers.ConsumerType = 'RabbitMQ';
            if (!headers.Language) headers.Language = 'Javascript';
            return headers;
        }

        /**
         * Callback called by RabbitMQ when consuming a message.  Calls the consumeMessage callback passed into the client
         * constructor.  If there is an exception the message is sent to the retry queue.  If an exception occurs and the
         * message has been retried the max number of times then the message is sent to the error queue.  If auditing is
         * enabled a copy of the message is sent to the audit queue. Acks the message at the end if noAck is false.
         * @param  {Object} rawMessage
         */

    }, {
        key: '_consumeMessage',
        value: function _consumeMessage(rawMessage) {
            try {
                if (!rawMessage.properties.headers.TypeName) {
                    this.config.events.error({ error: "Message does not contain TypeName", message: rawMessage });
                    throw {
                        error: "Message does not contain TypeName",
                        message: rawMessage
                    };
                }
                this._processMessage(rawMessage);
            } finally {
                if (!this.config.amqpSettings.queue.noAck) {
                    this.channel.ack(rawMessage);
                }
            }
        }

        /**
         * Processes the RabbitMQ message.  Calls the consumeMessage callback passed into the client
         * constructor.  If there is an exception the message is sent to the retry queue.  If an exception occurs and the
         * message has been retried the max number of times then the message is sent to the error queue.  If auditing is
         * enabled a copy of the message is sent to the audit queue.
         * @param  {Object} rawMessage
         */

    }, {
        key: '_processMessage',
        value: function _processMessage(rawMessage) {
            var result = void 0;

            try {
                rawMessage.properties.headers.TimeReceived = new Date().toISOString();
                rawMessage.properties.headers.DestinationMachine = _os2.default.hostname();
                rawMessage.properties.headers.DestinationAddress = this.config.amqpSettings.queue.name;

                var message = JSON.parse(rawMessage.content.toString());

                result = this.consumeMessageCallback(message, rawMessage.properties.headers, rawMessage.properties.headers.TypeName);

                rawMessage.properties.headers.TimeProcessed = new Date().toISOString();

                // forward to audit queue is audit is enabled
                if (result.success && this.config.amqpSettings.auditEnabled) {
                    this.channel.sendToQueue(this.config.amqpSettings.auditQueue, rawMessage.content, {
                        headers: rawMessage.properties.headers,
                        messageId: rawMessage.properties.messageId
                    });
                }
            } catch (ex) {
                result = {
                    exception: ex,
                    success: false
                };
            }

            if (!result.success) {
                var retryCount = 0;
                if (rawMessage.properties.headers.RetryCount !== undefined) {
                    retryCount = rawMessage.properties.headers.RetryCount;
                }

                if (retryCount < this.config.amqpSettings.maxRetries) {
                    retryCount++;
                    rawMessage.properties.headers.RetryCount = retryCount;
                    this.channel.sendToQueue(this.config.amqpSettings.queue.name + ".Retries", rawMessage.content, {
                        headers: rawMessage.properties.headers,
                        messageId: rawMessage.properties.messageId
                    });
                } else {
                    rawMessage.properties.headers.Exception = result.exception;
                    this.channel.sendToQueue(this.config.amqpSettings.errorQueue, rawMessage.content, {
                        headers: rawMessage.properties.headers,
                        messageId: rawMessage.properties.messageId
                    });
                }
            }
        }

        /**
         * Closes RabbitMQ channel.
         */

    }, {
        key: 'close',
        value: function close() {
            console.info("Closing Bus");
            if (this.config.amqpSettings.queue.autoDelete) {
                this.channel.deleteQueue(this.config.amqpSettings.queue.name + ".Retries");
            }
            this.channel.close();
        }
    }]);

    return Client;
}();

exports.default = Client;
//# sourceMappingURL=rabbitMQ.js.map