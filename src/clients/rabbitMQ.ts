import amqp, { AmqpConnectionManager, ChannelWrapper } from 'amqp-connection-manager';
import os from 'os';
import mergeDeep from "deepmerge";
import {v4 as guid} from "uuid";
import { ConfirmChannel, ConsumeMessage, Options } from 'amqplib';
import { BusConfig, ConsumeMessageCallback, IClient, Message } from '../types';

/** Class representing the rabbitMQ client. */
export default class implements IClient {

  config: BusConfig;
  consumeMessageCallback: ConsumeMessageCallback;
  connection: AmqpConnectionManager | undefined;
  channel: ChannelWrapper | undefined;
  
  processing = 0;

  /**
   * Sets config and connects to RabbitMQ
   * @constructor
   * @param  {Object} config
   * @param (Function) consumeMessageCallback
   */
  constructor(config : BusConfig, consumeMessageCallback : ConsumeMessageCallback) {
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
  public async connect() {
    try {
      let options = {};
      if (this.config.amqpSettings.ssl) {
        options = mergeDeep(options, this.config.amqpSettings.ssl);
      }

      let hosts = Array.isArray(this.config.amqpSettings.host) ? this.config.amqpSettings.host : [this.config.amqpSettings.host];

      this.connection = amqp.connect(hosts, { connectionOptions: options });
      this.connection.on('connect', () => this.config.logger?.info(`Connected ${this.config.amqpSettings.queue.name}`));
      this.connection.on('disconnect', (err : any) => this.config.logger?.error(`Disconnected ${this.config.amqpSettings.queue.name}`, err));
      this.connection.on('connectFailed', (err : any) => this.config.logger?.error(`Connection failed ${this.config.amqpSettings.queue.name}`, err));
      this.connection.on('blocked', (err : any) => this.config.logger?.error(`Blocked by broker ${this.config.amqpSettings.queue.name}`, err));

      await new Promise<void>((resolve, reject) => {
        try {          
          this.config.logger?.info("Building RabbitMQ channel");
          this.connection?.createChannel({ })
          this.channel = this.connection?.createChannel({
            json: true,
            setup: async (channel : ConfirmChannel) => {
              await channel.prefetch(this.config.amqpSettings.prefetch);              
              this.config.logger?.info("RabbitMQ channel created.");
              await this._createQueues(channel);
              resolve();
            }
          });
        } catch (error) {
          reject(error);
        }        
      })
      
    } catch (error) {
      this.config.logger?.error("Error connecting to rabbitmq", error);
      throw error;
    }    
  }

  /**
   * Creates host queue, retry queue and error queue.  It then sets up handler mappings and begins consuming messages.
   * The connected event is fired after consuming has begun.
   */
  async _createQueues(channel : ConfirmChannel){
    try {
      // create queue
      let queueOpts : Options.AssertQueue = {
        durable: this.config.amqpSettings.queue.durable,
        exclusive: this.config.amqpSettings.queue.exclusive,
        autoDelete: this.config.amqpSettings.queue.autoDelete,
      };

      if (this.config.amqpSettings.queue.maxPriority !== null && this.config.amqpSettings.queue.maxPriority !== undefined) {
        queueOpts.maxPriority = this.config.amqpSettings.queue.maxPriority;
      }

      this.config.logger?.info(`Creating queue ${this.config.amqpSettings.queue.name}.`);

      await channel.assertQueue(this.config.amqpSettings.queue.name, queueOpts);

      // bind queue to message types      
      this.config.logger?.info(`Binding message handlers to queue.`);
      for(var key in this.config.handlers){
        let type = key.replace(/\./g, "");

        await channel.assertExchange(type, 'fanout', {
          durable: true
        });

        await channel.bindQueue(this.config.amqpSettings.queue.name, type, '');
      }      

      // Create retry queue if retries are enabled
      if (this.config.amqpSettings.maxRetries > 0) {

        // Create dead letter exchange
        this.config.logger?.info(`Creating retry queue.`);

        let deadLetterExchange = this.config.amqpSettings.queue.name + ".Retries.DeadLetter";
        await channel.assertExchange(deadLetterExchange, 'direct', {
          durable: true
        });

        let retryQueue = this.config.amqpSettings.queue.name + ".Retries";
        await channel.assertQueue(retryQueue,  {
          durable: this.config.amqpSettings.queue.durable,
          arguments: {
            "x-dead-letter-exchange": deadLetterExchange,
            "x-message-ttl": this.config.amqpSettings.retryDelay
          }
        });

        await channel.bindQueue(this.config.amqpSettings.queue.name, deadLetterExchange, retryQueue);
      }

      // configure error exchange
      this.config.logger?.info(`Configuring Error queue.`);

      await channel.assertExchange(this.config.amqpSettings.errorQueue, 'direct', {
        durable: false
      });

      // create error queue
      await channel.assertQueue(this.config.amqpSettings.errorQueue,  {
        durable: true,
        autoDelete: false
      });

      if (this.config.amqpSettings.auditEnabled)
      {
        this.config.logger?.info(`Configuring audit queue.`);

        // configure audit exchange
        await channel.assertExchange(this.config.amqpSettings.auditQueue, 'direct', {
          durable: false
        });

        // create error audit
        await channel.assertQueue(this.config.amqpSettings.auditQueue,  {
          durable: true,
          autoDelete: false
        });
      }

      this.config.logger?.info(`Binding consume message callback to queue.`);

      await channel.consume(this.config.amqpSettings.queue.name, this._consumeMessage, {
        noAck: this.config.amqpSettings.queue.noAck
      });
    } catch (error) {
      this.config.logger?.error("Error configuring rabbitmq message bus", error);
      throw error;
    }    
  }

  /**
   * Starts consuming the message type.  Creates a durable exchange named @message of type fanout.
   * Binds the clients queue to the exchange.
   * @param {string} type
   */
  public async consumeType(type : string) : Promise<void>{
    await this.channel?.addSetup((channel: ConfirmChannel) => {
      return Promise.all([
        channel.assertExchange(type, 'fanout', { durable: true }),
        channel.bindQueue(this.config.amqpSettings.queue.name, type, '')
      ])
    });
  }

  /**
   * Stops listening for the message.  Unbinds the exchange named @type from the client queue.
   * @param {String} type
   */
  public async removeType(type : string) : Promise<void>{
    await this.channel?.removeSetup((channel : ConfirmChannel) => {
      return channel.unbindQueue(this.config.amqpSettings.queue.name, type, "");
    });
  }

  /**
   * Sends a command to the specified endpoint(s).
   * @param {String|Array} endpoint
   * @param {String} type
   * @param {Object} message
   * @param  Object|undefined} headers
   */
  public async send(endpoint : string | string[], type : string, message : Message, headers : {[k:string]: unknown} = {}) {
    let endpoints = Array.isArray(endpoint) ? endpoint : [endpoint];

    await Promise.all(endpoints.map(ep => {
      let messageHeaders = this._getHeaders(type, headers, ep, "Send");

      let options : Options.Publish = { headers: messageHeaders, messageId: messageHeaders.MessageId as string };
      if (messageHeaders.hasOwnProperty("Priority")) {
        options.priority = messageHeaders.Priority as number
      }
      return this.channel?.sendToQueue(ep, message, options);
    }));
  }

  /**
   * Published an event of the specified type.
   * @param {String} type
   * @param {Object} message
   * @param {Object|undefined} headers
   */
  public async publish(type : string, message : Message, headers : {[k:string]: unknown} = {}){
    let messageHeaders = this._getHeaders(type, headers, this.config.amqpSettings.queue.name, "Publish");

    let options : Options.Publish = { headers: messageHeaders, messageId: messageHeaders.MessageId as string };
    if (messageHeaders.hasOwnProperty("Priority")) {
      options.priority = messageHeaders.Priority as number
    }

    await this.channel?.addSetup((channel : ConfirmChannel) => {
      return channel.assertExchange(type.replace(/\./g, ""), 'fanout', { durable: true });
    }).then(() => {
      return this.channel?.publish(type.replace(/\./g, ""), '', message, options);
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
  _getHeaders(type : string, headers : {[k:string]: unknown}, queue : string, messageType : string){
    headers = mergeDeep({}, headers || {});
    if (!headers.DestinationAddress) headers.DestinationAddress = queue;
    if (!headers.MessageId) headers.MessageId = guid();
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
  async _consumeMessage(rawMessage : ConsumeMessage | null){
    if (rawMessage === null) return;
    this.processing++;

    try {

      if (!rawMessage.properties.headers.TypeName){
        this.config.logger?.error("Message does not contain TypeName");
        return;
      }

      await this._processMessage(rawMessage);

    } catch (error) {      
      this.config.logger?.error("Error processing message", error);
    } finally {
      if(!this.config.amqpSettings.queue.noAck){
        this.channel?.ack(rawMessage);
      }

      this.processing--;
    }
  }

  /**
   * Processes the RabbitMQ message.  Calls the consumeMessage callback passed into the client
   * constructor.  If there is an exception the message is sent to the retry queue.  If an exception occurs and the
   * message has been retried the max number of times then the message is sent to the error queue.  If auditing is
   * enabled a copy of the message is sent to the audit queue.
   * @param  {Object} rawMessage
   */
  async _processMessage(rawMessage : ConsumeMessage) {
    let result = null,
      headers = rawMessage.properties.headers;

    try {

      headers.TimeReceived = headers.TimeReceived || new Date().toISOString();
      headers.DestinationMachine = headers.DestinationMachine || os.hostname();
      headers.DestinationAddress = headers.DestinationAddress || this.config.amqpSettings.queue.name;

      let message : Message = JSON.parse(rawMessage.content.toString());

      try {
        await this.consumeMessageCallback(
          message,
          headers,
          headers.TypeName as string);
      } catch (e : any) {
        if (e === null || e === undefined ||
          (e !== null && e != undefined && typeof e !== 'object')  ||
          (e !== null && e != undefined && typeof e === 'object' && e.retry !== false)) {
          result = {
            exception: e,
            success: false
          };
        }
      }

      headers.TimeProcessed = headers.TimeProcessed || new Date().toISOString();

      // forward to audit queue is audit is enabled
      if(result === null && this.config.amqpSettings.auditEnabled) {
        await this.channel?.sendToQueue(
          this.config.amqpSettings.auditQueue,
          JSON.parse(rawMessage.content.toString()),
          {
            headers: headers,
            messageId: rawMessage.properties.messageId
          });
      }

    } catch(ex) {
      result = {
        exception: ex,
        success: false
      };
    }

    if (this.config.amqpSettings?.maxRetries !== 0) {
      if(result !== null) {
        let retryCount = 0;
        if(headers.RetryCount !== undefined){
          retryCount = headers.RetryCount;
        }
  
        if (retryCount < this.config.amqpSettings.maxRetries){
          retryCount++;
          headers.RetryCount = retryCount;
  
          await this.channel?.sendToQueue(
            this.config.amqpSettings.queue.name + ".Retries",
            JSON.parse(rawMessage.content.toString()),
            {
              headers: headers,
              messageId: rawMessage.properties.messageId
            });
        } else {
          headers.Exception = result.exception;
          await this.channel?.sendToQueue(
            this.config.amqpSettings.errorQueue,
            JSON.parse(rawMessage.content.toString()),
            {
              headers: headers,
              messageId: rawMessage.properties.messageId
            });
        }
      }
    }
    
  }

  /**
   * Closes RabbitMQ channel.
   */
  public async close(){
    const channelObj = this.channel as any;

    if(this.config.amqpSettings.maxRetries !== 0 && this.config.amqpSettings.queue.autoDelete){
      await channelObj._channel.deleteQueue(this.config.amqpSettings.queue.name + ".Retries");
    }
    
    // Stop consuming messages.
    await channelObj._channel.cancel(Object.keys(channelObj._channel.consumers)[0])  

    // Wait until all messages have been processed.
    let timeout = 0;
    while (this.processing !== 0 && timeout < 6000) {
      await wait(100)
      timeout++;
    }

    // close channel
    await channelObj._channel.close();

    // Close connection
    await this.connection?.close();
  }

  async isConnected() {
    return this.connection?.isConnected() ?? false;
  }
}

function wait(time : number) : Promise<void> {
  return new Promise((resolve, _) => {
    setTimeout(() => resolve(), time);
  });
}

