import settings from './settings';
import merge from "deepmerge";
import { v4 as guid } from "uuid";
import { BusConfig, IBus, IClient, Message, MessageFilter, MessageHandler, ReplyCallback, RequestReplyCallback, ServiceConnectConfig } from './types';

/** Class representing a the message bus. */
export class Bus implements IBus {

  id: string;
  requestReplyCallbacks: {
    [MessageId:string]: RequestReplyCallback
  };
  config: BusConfig;
  client: IClient | null = null;

  public initialized : boolean = false;

  /**
   * Sets config and creates client
   * @constructor
   * @param {Object} config
   */
  constructor(config : ServiceConnectConfig) {
    this.id = guid();
    this.config = merge(settings(), config);
    this.init = this.init.bind(this);
    this._consumeMessage = this._consumeMessage.bind(this);
    this.addHandler = this.addHandler.bind(this);
    this.removeHandler = this.removeHandler.bind(this);
    this.send = this.send.bind(this);
    this.publish = this.publish.bind(this);
    this._processHandlers = this._processHandlers.bind(this);
    this.isHandled = this.isHandled.bind(this);
    this.requestReplyCallbacks = {};
  }

  /**
   * Creates and connects to client
   * @return {Promise}
   */
  public async init() : Promise<void> {
    this.client = new (this.config.client as any)(this.config, this._consumeMessage) as IClient;    
    await this.client.connect();
    this.initialized = true;
  }

  /**
   * Starts consuming the message type and binds the callback to the message type.
   * @param {String} messageType
   * @param  {Promise} callback
   */
  public async addHandler(messageType : string, callback : MessageHandler) : Promise<void> {
    var type = messageType.replace(/\./g, "");
    if(type !== "*"){
      await this.client?.consumeType(type);
    }
    this.config.handlers[messageType] = this.config.handlers[messageType] || [];
    this.config.handlers[messageType].push(callback);
  }

  /**
   * Removes the message type callback binding and stops listening for the message if there are no more callback
   * bindings.
   * @param {String} messageType
   * @param {Promise} 
   */
  public async removeHandler(messageType : string, callback : MessageHandler) : Promise<void> {
    if (this.config.handlers[messageType]){
      this.config.handlers[messageType] = this.config
        .handlers[messageType]
        .filter(c => c !== callback);

      if (messageType !== "*" && (this.config.handlers[messageType] === undefined ||
                  this.config.handlers[messageType].length === 0)){
        await this.client?.removeType(messageType.replace(/\./g, ""));
      }
    }
  }

  /**
   * Checks if the message type is being handled by the Bus.
   * @param {String} messageType
   * @return {Boolean}
   */
  isHandled(messageType : string) {
    return this.config.handlers[messageType] !== undefined && this.config.handlers[messageType].length !== 0;
  }

  /**
   * Sends a command to the specified endpoint(s).
   * @param {String|Array} endpoint
   * @param {String} type
   * @param {Object} message
   * @param {Object|undefined} headers
   * @return {Promise}
   */
  async send(endpoint : string | string[], type : string, message : Message, headers : {[k:string]: unknown} = {}) {
    let result = await this._processFilters(this.config.filters.outgoing, message, headers, type);
    if (!result) {
      return;
    }
    return this.client?.send(endpoint, type, message, headers);
  }

  /**
   * Publishes an event of the specified type.
   * @param {String} type
   * @param {Object} message
   * @param {Object|undefined} headers
   * @return {Promise}
   */
  async publish(type: string, message: Message, headers : {[k:string]: unknown} = {}){
    let result = await this._processFilters(this.config.filters.outgoing, message, headers, type);
    if (!result) {
      return;
    }
    return this.client?.publish(type, message, headers);
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
  async sendRequest(endpoint: string | string[], type : string, message : Message, callback : MessageHandler, headers : {[k:string]: unknown} = {}){
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
    return this.client?.send(endpoint, type, message, headers);
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
  async publishRequest(type : string, message : Message, callback : MessageHandler, expected : number | null = null, timeout : number | null = 10000, headers : {[k:string]: unknown} = {}){
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
          clearTimeout(this.requestReplyCallbacks[messageId].timeout!);
          delete this.requestReplyCallbacks[messageId];
        }
      }, timeout);
    }

    return this.client?.publish(type, message, headers);
  }

  /**
   * Callback called when consuming a message.  Calls handler callbacks.
   * @param  {Object} message
   * @param  {Object} headers
   * @param  {string} type
   * @return {Promise} result
   */
  async _consumeMessage(message : Message, headers : {[k:string]: unknown}, type : string){
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
      this.config.logger?.error("Error processing message", e);
      throw e;
    } 
  }

  async _processFilters(filters : MessageFilter[], message : Message, headers : {[k:string]: unknown}, type : string) {
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
  _processHandlers(message : Message, headers : {[k:string]: unknown}, type : string) {
    let handlers = this.config.handlers[type] || [],
      promises : (Promise<void> | void)[]= [];

    if (this.config.handlers["*"] !== undefined && this.config.handlers["*"] !== null){
      handlers = [...handlers, ...this.config.handlers["*"]];
    }

    if (handlers.length > 0){
      let replyCallback = this._getReplyCallback(headers);
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
  _processRequestReplies(message : Message, headers: {[k:string]: unknown}, type : string) {
    let promise = null;
    if (headers["ResponseMessageId"]){
      const responseId = headers["ResponseMessageId"] as string;
      let configuration = this.requestReplyCallbacks[responseId];
      if (configuration){
        promise = configuration.callback(message, headers, type);
        configuration.processedCount++;
        if (configuration.processedCount >= configuration.endpointCount){
          if (this.requestReplyCallbacks[responseId].timeout){
            clearTimeout(this.requestReplyCallbacks[responseId].timeout!);
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
  _getReplyCallback(headers : {[k:string]: unknown}) : ReplyCallback {
    return async (type : string, message : Message) => {
      headers["ResponseMessageId"] = headers["RequestMessageId"];
      await this.send(headers["SourceAddress"] as string, type, message, headers);
    }
  }

  /**
   * Returns true if the client is connected
   * @return {Promise<boolean>}
   */
  async isConnected() {
      return await this.client?.isConnected() ?? false;
  }

  /**
   * Disposes of Bus resources.
   */
  async close(){
    await this.client?.close();
    this.initialized = false;
  }
}
