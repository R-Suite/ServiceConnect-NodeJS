'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _utils = require('../utils');

var _os = require('os');

var _os2 = _interopRequireDefault(_os);

var _events = require('events');

var _events2 = _interopRequireDefault(_events);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var amqp = require('amqp-connection-manager');

/** Class representing the rabbitMQ client. */
var Client = function (_EventEmitter) {
  _inherits(Client, _EventEmitter);

  /**
   * Sets config and connects to RabbitMQ
   * @constructor
   * @param  {Object} config
   * @param (Function) consumeMessageCallback
   */
  function Client(config, consumeMessageCallback) {
    _classCallCheck(this, Client);

    var _this = _possibleConstructorReturn(this, (Client.__proto__ || Object.getPrototypeOf(Client)).call(this));

    _this.config = config;
    _this.consumeMessageCallback = consumeMessageCallback;
    _this._consumeMessage = _this._consumeMessage.bind(_this);
    _this._createQueues = _this._createQueues.bind(_this);
    _this.consumeType = _this.consumeType.bind(_this);
    _this.removeType = _this.removeType.bind(_this);
    _this.publish = _this.publish.bind(_this);
    _this.send = _this.send.bind(_this);
    _this._getHeaders = _this._getHeaders.bind(_this);
    _this._processMessage = _this._processMessage.bind(_this);
    _this.close = _this.close.bind(_this);
    return _this;
  }

  /**
   *
   * Creates connection, creates channel and then sets up RabbitMQ queues and exchanges.
   */


  _createClass(Client, [{
    key: 'connect',
    value: function connect() {
      var _this2 = this;

      var options = {};
      if (this.config.amqpSettings.ssl) {
        options = (0, _utils.mergeDeep)(options, this.config.amqpSettings.ssl);
      }

      var hosts = Array.isArray(this.config.amqpSettings.host) ? this.config.amqpSettings.host : [this.config.amqpSettings.host];

      this.connection = amqp.connect(hosts, { connectionOptions: options });
      this.channel = this.connection.createChannel({
        json: true,
        setup: function setup(channel) {
          channel.prefetch(_this2.config.amqpSettings.prefetch);
          _this2._createQueues(channel);
        }
      });
    }

    /**
     * Creates host queue, retry queue and error queue.  It then sets up handler mappings and begins consuming messages.
     * The connected event is fired after consuming has begun.
     */

  }, {
    key: '_createQueues',
    value: function _createQueues(channel) {
      // create queue
      channel.assertQueue(this.config.amqpSettings.queue.name, {
        durable: this.config.amqpSettings.queue.durable,
        exclusive: this.config.amqpSettings.queue.exclusive,
        autoDelete: this.config.amqpSettings.queue.autoDelete,
        maxPriority: this.config.amqpSettings.queue.maxPriority
      });

      // bind queue to message types
      for (var key in this.config.handlers) {
        var type = key.replace(/\./g, "");

        channel.assertExchange(type, 'fanout', {
          durable: true
        });

        channel.bindQueue(this.config.amqpSettings.queue.name, type, '');
      }

      // Create dead letter exchange
      var deadLetterExchange = this.config.amqpSettings.queue.name + ".Retries.DeadLetter";
      channel.assertExchange(deadLetterExchange, 'direct', {
        durable: true
      });

      // Create retry queue
      var retryQueue = this.config.amqpSettings.queue.name + ".Retries";
      channel.assertQueue(retryQueue, {
        durable: this.config.amqpSettings.queue.durable,
        arguments: {
          "x-dead-letter-exchange": deadLetterExchange,
          "x-message-ttl": this.config.amqpSettings.retryDelay
        }
      });

      channel.bindQueue(this.config.amqpSettings.queue.name, deadLetterExchange, retryQueue);

      // configure error exchange
      channel.assertExchange(this.config.amqpSettings.errorQueue, 'direct', {
        durable: false
      });

      // create error queue
      channel.assertQueue(this.config.amqpSettings.errorQueue, {
        durable: true,
        autoDelete: false
      });

      if (this.config.amqpSettings.auditEnabled) {
        // configure audit exchange
        channel.assertExchange(this.config.amqpSettings.auditQueue, 'direct', {
          durable: false
        });

        // create error audit
        channel.assertQueue(this.config.amqpSettings.auditQueue, {
          durable: true,
          autoDelete: false
        });
      }

      channel.consume(this.config.amqpSettings.queue.name, this._consumeMessage, {
        noAck: this.config.amqpSettings.queue.noAck
      });

      this.emit("connected");
    }

    /**
     * Starts consuming the message type.  Creates a durable exchange named @message of type fanout.
     * Binds the clients queue to the exchange.
     * @param {string} type
     */

  }, {
    key: 'consumeType',
    value: function consumeType(type) {
      var _this3 = this;

      this.channel.addSetup(function (channel) {
        Promise.all([channel.assertExchange(type, 'fanout', { durable: true }), channel.bindQueue(_this3.config.amqpSettings.queue.name, type, '')]);
      });
    }

    /**
     * Stops listening for the message.  Unbinds the exchange named @type from the client queue.
     * @param {String} type
     */

  }, {
    key: 'removeType',
    value: function removeType(type) {
      var _this4 = this;

      this.channel.removeSetup(function (channel) {
        return channel.unbindQueue(_this4.config.amqpSettings.queue.name, type);
      });
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
      var _this5 = this;

      var headers = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : {};

      var endpoints = Array.isArray(endpoint) ? endpoint : [endpoint];

      return Promise.all(endpoints.map(function (ep) {
        var messageHeaders = _this5._getHeaders(type, headers, ep, "Send");

        var options = { headers: messageHeaders, messageId: messageHeaders.MessageId };
        if (messageHeaders.hasOwnProperty("Priority")) {
          options.priority = messageHeaders.Priority;
        }
        return _this5.channel.sendToQueue(ep, message, options);
      }));
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
      var _this6 = this;

      var headers = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};

      var messageHeaders = this._getHeaders(type, headers, this.config.amqpSettings.queue.name, "Publish");

      var options = { headers: messageHeaders, messageId: messageHeaders.MessageId };
      if (messageHeaders.hasOwnProperty("Priority")) {
        options.priority = messageHeaders.Priority;
      }

      return this.channel.addSetup(function (channel) {
        return channel.assertExchange(type.replace(/\./g, ""), 'fanout', { durable: true });
      }).then(function () {
        return _this6.channel.publish(type.replace(/\./g, ""), '', message, options);
      });
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
      if (!headers.TypeName) headers.FullTypeName = type;
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
      var _this7 = this;

      if (!rawMessage.properties.headers.TypeName) {
        this.emit("error", { error: "Message does not contain TypeName", message: rawMessage });
        throw {
          error: "Message does not contain TypeName",
          message: rawMessage
        };
      }

      this._processMessage(rawMessage).catch(function () {}).then(function () {
        if (!_this7.config.amqpSettings.queue.noAck) {
          _this7.channel.ack(rawMessage);
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

  }, {
    key: '_processMessage',
    value: function () {
      var _ref = _asyncToGenerator( /*#__PURE__*/regeneratorRuntime.mark(function _callee(rawMessage) {
        var result, headers, message, retryCount;
        return regeneratorRuntime.wrap(function _callee$(_context) {
          while (1) {
            switch (_context.prev = _context.next) {
              case 0:
                result = null, headers = rawMessage.properties.headers;
                _context.prev = 1;


                headers.TimeReceived = headers.TimeReceived || new Date().toISOString();
                headers.DestinationMachine = headers.DestinationMachine || _os2.default.hostname();
                headers.DestinationAddress = headers.DestinationAddress || this.config.amqpSettings.queue.name;

                message = JSON.parse(rawMessage.content.toString());
                _context.prev = 6;
                _context.next = 9;
                return this.consumeMessageCallback(message, headers, headers.TypeName);

              case 9:
                _context.next = 14;
                break;

              case 11:
                _context.prev = 11;
                _context.t0 = _context['catch'](6);

                if (_context.t0 === null || _context.t0 === undefined || _context.t0 !== null && _context.t0 != undefined && (typeof _context.t0 === 'undefined' ? 'undefined' : _typeof(_context.t0)) !== 'object' || _context.t0 !== null && _context.t0 != undefined && (typeof _context.t0 === 'undefined' ? 'undefined' : _typeof(_context.t0)) === 'object' && _context.t0.retry !== false) {
                  result = {
                    exception: _context.t0,
                    success: false
                  };
                }

              case 14:

                headers.TimeProcessed = headers.TimeProcessed || new Date().toISOString();

                // forward to audit queue is audit is enabled
                if (result === null && this.config.amqpSettings.auditEnabled) {
                  this.channel.sendToQueue(this.config.amqpSettings.auditQueue, JSON.parse(rawMessage.content.toString()), {
                    headers: headers,
                    messageId: rawMessage.properties.messageId
                  });
                }

                _context.next = 21;
                break;

              case 18:
                _context.prev = 18;
                _context.t1 = _context['catch'](1);

                result = {
                  exception: _context.t1,
                  success: false
                };

              case 21:

                if (result !== null) {
                  retryCount = 0;

                  if (headers.RetryCount !== undefined) {
                    retryCount = headers.RetryCount;
                  }

                  if (retryCount < this.config.amqpSettings.maxRetries) {
                    retryCount++;
                    headers.RetryCount = retryCount;

                    this.channel.sendToQueue(this.config.amqpSettings.queue.name + ".Retries", JSON.parse(rawMessage.content.toString()), {
                      headers: headers,
                      messageId: rawMessage.properties.messageId
                    });
                  } else {
                    headers.Exception = result.exception;
                    this.channel.sendToQueue(this.config.amqpSettings.errorQueue, JSON.parse(rawMessage.content.toString()), {
                      headers: headers,
                      messageId: rawMessage.properties.messageId
                    });
                  }
                }

              case 22:
              case 'end':
                return _context.stop();
            }
          }
        }, _callee, this, [[1, 18], [6, 11]]);
      }));

      function _processMessage(_x3) {
        return _ref.apply(this, arguments);
      }

      return _processMessage;
    }()

    /**
     * Closes RabbitMQ channel.
     */

  }, {
    key: 'close',
    value: function close() {
      var _this8 = this;

      if (this.config.amqpSettings.queue.autoDelete) {
        this.channel.removeSetup(function (channel) {
          return channel.deleteQueue(_this8.config.amqpSettings.queue.name + ".Retries");
        });
      }
      this.channel.close();
    }
  }]);

  return Client;
}(_events2.default);

exports.default = Client;

function sleep(milliseconds) {
  var start = new Date().getTime();
  for (var i = 0; i < 1e7; i++) {
    if (new Date().getTime() - start > milliseconds) {
      break;
    }
  }
}
module.exports = exports['default'];
//# sourceMappingURL=rabbitMQ.js.map