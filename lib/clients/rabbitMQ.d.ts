/// <reference types="node" />
import { AmqpConnectionManager, ChannelWrapper } from 'amqp-connection-manager';
import EventEmitter from 'events';
import { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { BusConfig, ConsumeMessageCallback, IClient } from '../types';
/** Class representing the rabbitMQ client. */
export default class extends EventEmitter implements IClient {
    config: BusConfig;
    consumeMessageCallback: ConsumeMessageCallback;
    connection: AmqpConnectionManager | undefined;
    channel: ChannelWrapper | undefined;
    processing: number;
    /**
     * Sets config and connects to RabbitMQ
     * @constructor
     * @param  {Object} config
     * @param (Function) consumeMessageCallback
     */
    constructor(config: BusConfig, consumeMessageCallback: ConsumeMessageCallback);
    /**
     *
     * Creates connection, creates channel and then sets up RabbitMQ queues and exchanges.
     */
    connect(): void;
    /**
     * Creates host queue, retry queue and error queue.  It then sets up handler mappings and begins consuming messages.
     * The connected event is fired after consuming has begun.
     */
    _createQueues(channel: ConfirmChannel): void;
    /**
     * Starts consuming the message type.  Creates a durable exchange named @message of type fanout.
     * Binds the clients queue to the exchange.
     * @param {string} type
     */
    consumeType(type: string): void;
    /**
     * Stops listening for the message.  Unbinds the exchange named @type from the client queue.
     * @param {String} type
     */
    removeType(type: string): void;
    /**
     * Sends a command to the specified endpoint(s).
     * @param {String|Array} endpoint
     * @param {String} type
     * @param {Object} message
     * @param  Object|undefined} headers
     */
    send(endpoint: string | string[], type: string, message: object, headers?: {
        [k: string]: unknown;
    }): Promise<void>;
    /**
     * Published an event of the specified type.
     * @param {String} type
     * @param {Object} message
     * @param {Object|undefined} headers
     */
    publish(type: string, message: object, headers?: {
        [k: string]: unknown;
    }): Promise<void>;
    /**
     * Creates a object containing the standard message headers that need to be sent with all messages.
     * @param {String} type
     * @param {Object} headers
     * @param {String} queue
     * @param {String} messageType
     * @return {Object} headers
     */
    _getHeaders(type: string, headers: {
        [k: string]: unknown;
    }, queue: string, messageType: string): {
        [k: string]: unknown;
    };
    /**
     * Callback called by RabbitMQ when consuming a message.  Calls the consumeMessage callback passed into the client
     * constructor.  If there is an exception the message is sent to the retry queue.  If an exception occurs and the
     * message has been retried the max number of times then the message is sent to the error queue.  If auditing is
     * enabled a copy of the message is sent to the audit queue. Acks the message at the end if noAck is false.
     * @param  {Object} rawMessage
     */
    _consumeMessage(rawMessage: ConsumeMessage | null): void;
    /**
     * Processes the RabbitMQ message.  Calls the consumeMessage callback passed into the client
     * constructor.  If there is an exception the message is sent to the retry queue.  If an exception occurs and the
     * message has been retried the max number of times then the message is sent to the error queue.  If auditing is
     * enabled a copy of the message is sent to the audit queue.
     * @param  {Object} rawMessage
     */
    _processMessage(rawMessage: ConsumeMessage): Promise<void>;
    /**
     * Closes RabbitMQ channel.
     */
    close(): Promise<void>;
    private _on;
    private _off;
    private _emit;
    on: (event: string | symbol, listener: (...args: any[]) => void) => this;
    off: (event: string | symbol, listener: (...args: any[]) => void) => this;
    emit: (event: string | symbol, ...args: any[]) => boolean;
}
