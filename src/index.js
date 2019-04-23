import settings from './settings';
import {mergeDeep, guid} from './utils';
import EventEmitter from 'events';

/** Class representing a the message bus. */
export class Bus extends EventEmitter {

  initialized = false;

  /**
   * Sets config and creates client
   * @constructor
   * @param {Object} config
   */
  constructor(config) {
    super();
    this.id = guid();
    this.config = mergeDeep(settings(), config);
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
      this.client.connect();
      this.client.on("connected", () => {
        if (!this.initialized) {
          this.initialized = true;
          this.emit("connected");
          resolve();
        }
      });
    });
  }

  /**
   * Starts consuming the message type and binds the callback to the message type.
   * @param {String} message
   * @param  {Function} callback
   */
  addHandler(message, callback){
    var type = message.replace(/\./g, "");
    if(type !== "*"){
      this.client.consumeType(type);
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
  removeHandler(message, callback){
    if (this.config.handlers[message]){
      this.config.handlers[message] = this.config
        .handlers[message]
        .filter(c => c !== callback);

      if (message !== "*" && (this.config.handlers[message] === undefined ||
                  this.config.handlers[message].length === 0)){
        this.client.removeType(message.replace(/\./g, ""));
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
  async send(endpoint, type, message, headers = {}) {
    let result = await this._processFilters(this.config.filters.outgoing, message, headers, type);
    if (!result) {
      return;
    }
    return this.client.send(endpoint, type, message, headers);
  }

  /**
   * Publishes an event of the specified type.
   * @param {String} type
   * @param {Object} message
   * @param {Object|undefined} headers
   * @return {Promise}
   */
  async publish(type, message, headers = {}){
    let result = await this._processFilters(this.config.filters.outgoing, message, headers, type);
    if (!result) {
      return;
    }
    return this.client.publish(type, message, headers);
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
  async sendRequest(endpoint, type, message, callback, headers = {}){
    let messageId = guid();
    let endpoints = Array.isArray(endpoint) ? endpoint : [endpoint];

    let result = await this._processFilters(this.config.filters.outgoing, message, headers, type);

    if (!result) {
      return;
    }

    this.requestReplyCallbacks[messageId] = {
      endpointCount: endpoints.length,
      processedCount: 0,
      callback
    };
    headers["RequestMessageId"] = messageId;
    return this.client.send(endpoint, type, message, headers);
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
  async publishRequest(type, message, callback, expected = null, timeout = 10000, headers = {}){
    let messageId = guid();
    let result = await this._processFilters(this.config.filters.outgoing, message, headers, type);

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
        if (this.requestReplyCallbacks[messageId]){
          clearTimeout(this.requestReplyCallbacks[messageId].timeout);
          delete this.requestReplyCallbacks[messageId];
        }
      }, timeout);
    }

    return this.client.publish(type, message, headers);
  }

  /**
   * Callback called when consuming a message.  Calls handler callbacks.
   * @param  {Object} message
   * @param  {Object} headers
   * @param  {string} type
   * @return {Promise<Object>} result
   */
  async _consumeMessage(message, headers, type){
    try {
      let process = await this._processFilters(this.config.filters.before, message, headers, type);
      if (!process) {
        return;
      }

      await Promise.all([
        ...this._processHandlers(message, headers, type),
        this._processRequestReplies(message, headers, type)
      ]);

      process = await this._processFilters(this.config.filters.after, message, headers, type);
      if (!process) {
        return;
      }
    } catch (e) {
      this.emit("error", e);
      throw e;
    } 
  }

  async _processFilters(filters, message, headers, type) {
    for (var i = 0; i < filters.length; i++) {
      let result = await filters[i](message, headers, type, this);
      if (result === false) {
      return false;
      }
    }
    return true;
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
    let handlers = this.config.handlers[type] || [],
      promises = [];

    if (this.config.handlers["*"] !== undefined && this.config.handlers["*"] !== null){
      handlers = [...handlers, ...this.config.handlers["*"]];
    }

    if (handlers.length > 0){
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
    if (headers["ResponseMessageId"]){
      let configuration = this.requestReplyCallbacks[headers["ResponseMessageId"]];
      if (configuration){
        promise = configuration.callback(message, type, headers);
        configuration.processedCount++;
        if (configuration.processedCount >= configuration.endpointCount){
          if (this.requestReplyCallbacks[headers["ResponseMessageId"]].timeout){
            clearTimeout(this.requestReplyCallbacks[headers["ResponseMessageId"]].timeout);
          }
          delete this.requestReplyCallbacks[headers["ResponseMessageId"]];
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
    }
  }

  /**
   * Disposes of Bus resources.
   */
  close(){
    this.client.close();
  }
}
