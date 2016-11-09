import {mergeDeep, guid} from '../utils';
import amqp from 'amqplib/callback_api';
import os from 'os';
import EventEmitter from 'events';

/** Class representing the rabbitMQ client. */
export default class Client extends EventEmitter {

    /**
     * Sets config and connects to RabbitMQ
     * @constructor
     * @param  {Object} config
     * @param (Function) consumeMessageCallback
     */
    constructor(config, consumeMessageCallback) {
        super();
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
    connect(){
        var options = {};
        if (this.config.amqpSettings.ssl) {
            options = mergeDeep(options, this.config.amqpSettings.ssl);
        }

        amqp.connect(this.config.amqpSettings.host, options, (err, conn) => {
            if (err){
                this.emit("error", err);
                return;
            }
            this.connection = conn;
            this.connection.createChannel((err, channel) => {
                if (err){
                    this.emit("error", err);
                    return;
                }
                this.channel = channel;
                this._createQueues();
            })
        });
    }

    /**
     * Creates host queue, retry queue and error queue.  It then sets up handler mappings and begins consuming messages.
     * The connected event is fired after consuming has begun.
     */
    _createQueues(){
        console.info("Connection ready");
        console.info("Creating queue " + this.config.amqpSettings.queue.name);

        // create queue
        this.channel.assertQueue(this.config.amqpSettings.queue.name,  {
            durable: this.config.amqpSettings.queue.durable,
            exclusive: this.config.amqpSettings.queue.exclusive,
            autoDelete: this.config.amqpSettings.queue.autoDelete
        });
        console.info(this.config.amqpSettings.queue.name + " queue created.");

        // bind queue to message types
        for(var key in this.config.handlers){
            let type = key.replace(/\./g, "");

            this.channel.assertExchange(type, 'fanout', {
                durable: true
            });

            this.channel.bindQueue(this.config.amqpSettings.queue.name, type, '');

            console.info("Bound " + this.config.amqpSettings.queue.name + " to exchange " + key);
        }

        // Create dead letter exchange
        let deadLetterExchange = this.config.amqpSettings.queue.name + ".Retries.DeadLetter";
        this.channel.assertExchange(deadLetterExchange, 'fanout', {
            durable: true
        });

        // Create retry queue
        let retryQueue = this.config.amqpSettings.queue.name + ".Retries";
        console.info("Creating queue " + retryQueue);
        this.channel.assertQueue(retryQueue,  {
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
            durable: false
        });

        // create error queue
        console.info("Creating queue " + this.config.amqpSettings.errorQueue);
        this.channel.assertQueue(this.config.amqpSettings.errorQueue,  {
            durable: true,
            autoDelete: false
        });

        console.info(this.config.amqpSettings.errorQueue + " queue created.");

        if (this.config.amqpSettings.auditEnabled)
        {
            // configure audit exchange
            this.channel.assertExchange(this.config.amqpSettings.auditQueue, 'direct', {
                durable: false
            });

            // create error audit
            console.info("Creating queue " + this.config.amqpSettings.auditQueue);
            this.channel.assertQueue(this.config.amqpSettings.auditQueue,  {
                durable: true,
                autoDelete: false
            });
        }

        this.channel.consume(this.config.amqpSettings.queue.name, this._consumeMessage, {
            noAck: this.config.amqpSettings.queue.noAck
        });

        this.emit("connected");
    }

    /**
     * Starts consuming the message type.  Creates a durable exchange named @message of type fanout.
     * Binds the clients queue to the exchange.
     * @param {string} type
     */
    consumeType(type){
        this.channel.assertExchange(type, 'fanout', {
            durable: true
        });
        this.channel.bindQueue(this.config.amqpSettings.queue.name, type, '');
    }

    /**
     * Stops listening for the message.  Unbinds the exchange named @type from the client queue.
     * @param {String} type
     */
    removeType(type){
        this.channel.unbindQueue(this.config.amqpSettings.queue.name, type);
    }

    /**
     * Sends a command to the specified endpoint(s).
     * @param {String|Array} endpoint
     * @param  {String} type
     * @param  {Object} message
     * @param  {Object|undefined} headers
     */
    send(endpoint, type, message, headers = {}) {
        let endpoints = Array.isArray(endpoint) ? endpoint : [endpoint];
        endpoints.map(ep => {
            let messageHeaders = this._getHeaders(type, headers, ep, "Send");
            this.channel.sendToQueue(ep, new Buffer(JSON.stringify(message), "utf-8"), { headers: messageHeaders, messageId: messageHeaders.MessageId });
        });
    }

    /**
     * Published an event of the specified type.
     * @param  {String} type
     * @param  {Object} message
     * @param  {Object|undefined} headers
     */
    publish(type, message, headers = {}){
        let messageHeaders = this._getHeaders(type, headers, this.config.amqpSettings.queue.name, "Publish");
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
    _getHeaders(type, headers, queue, messageType){
        headers = mergeDeep({}, headers || {});
        if (!headers.DestinationAddress) headers.DestinationAddress = queue;
        if (!headers.MessageId) headers.MessageId = guid();
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
    _consumeMessage(rawMessage){
        try {
            if (!rawMessage.properties.headers.TypeName){
                this.emit("error", { error: "Message does not contain TypeName", message: rawMessage});
                throw {
                    error: "Message does not contain TypeName",
                    message: rawMessage
                }
            }
            this._processMessage(rawMessage)
        } finally {
            if(!this.config.amqpSettings.queue.noAck){
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
    _processMessage(rawMessage){
        let result,
            headers = rawMessage.properties.headers;

        try {

            headers.TimeReceived = headers.TimeReceived || new Date().toISOString();
            headers.DestinationMachine = headers.DestinationMachine || os.hostname();
            headers.DestinationAddress = headers.DestinationAddress || this.config.amqpSettings.queue.name;

            let message = JSON.parse(rawMessage.content.toString());

            result = this.consumeMessageCallback(
                message,
                headers,
                headers.TypeName);

            headers.TimeProcessed = headers.TimeProcessed || new Date().toISOString();

            // forward to audit queue is audit is enabled
            if(result.success && this.config.amqpSettings.auditEnabled) {
                this.channel.sendToQueue(
                    this.config.amqpSettings.auditQueue,
                    rawMessage.content,
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

        if(!result.success) {
            let retryCount = 0;
            if(headers.RetryCount !== undefined){
                retryCount = headers.RetryCount;
            }

            if (retryCount < this.config.amqpSettings.maxRetries){
                retryCount++;
                headers.RetryCount = retryCount;
                this.channel.sendToQueue(
                    this.config.amqpSettings.queue.name + ".Retries",
                    rawMessage.content,
                    {
                        headers: headers,
                        messageId: rawMessage.properties.messageId
                    });
            } else {
                headers.Exception = result.exception;
                this.channel.sendToQueue(
                    this.config.amqpSettings.errorQueue,
                    rawMessage.content,
                    {
                        headers: headers,
                        messageId: rawMessage.properties.messageId
                    });
            }
        }
    }

    /**
     * Closes RabbitMQ channel.
     */
    close(){
        if(this.config.amqpSettings.queue.autoDelete){
            this.channel.deleteQueue(this.config.amqpSettings.queue.name + ".Retries");
        }
        this.channel.close();
    }
}