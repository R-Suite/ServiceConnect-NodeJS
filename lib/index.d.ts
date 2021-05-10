/// <reference types="node" />
import EventEmitter from 'events';
import { BusConfig, IBus, IClient, MessageFilter, MessageHandler, RequestReplyCallback, ServiceConnectConfig } from './types';
/** Class representing a the message bus. */
export declare class Bus extends EventEmitter implements IBus {
    id: string;
    requestReplyCallbacks: {
        [MessageId: string]: RequestReplyCallback;
    };
    config: BusConfig;
    client: IClient | null;
    initialized: boolean;
    /**
     * Sets config and creates client
     * @constructor
     * @param {Object} config
     */
    constructor(config: ServiceConnectConfig);
    /**
     * Creates AMQP client and fires connected event when client has connected
     * @return {Promise}
     */
    init(): Promise<void>;
    /**
     * Starts consuming the message type and binds the callback to the message type.
     * @param {String} message
     * @param  {Function} callback
     */
    addHandler(message: string, callback: MessageHandler): void;
    /**
     * Removes the message type callback binding and stops listening for the message if there are no more callback
     * bindings.
     * @param {String} message
     * @param {Function} callback
     */
    removeHandler(message: string, callback: MessageHandler): void;
    /**
     * Checks if the message type is being handled by the Bus.
     * @param {String} message
     * @return {Boolean}
     */
    isHandled(message: string): boolean;
    /**
     * Sends a command to the specified endpoint(s).
     * @param {String|Array} endpoint
     * @param {String} type
     * @param {Object} message
     * @param {Object|undefined} headers
     * @return {Promise}
     */
    send(endpoint: string | string[], type: string, message: any, headers?: {
        [k: string]: unknown;
    }): Promise<void>;
    /**
     * Publishes an event of the specified type.
     * @param {String} type
     * @param {Object} message
     * @param {Object|undefined} headers
     * @return {Promise}
     */
    publish(type: string, message: any, headers?: {
        [k: string]: unknown;
    }): Promise<void>;
    /**
     * Sends a command to the specified endpoint(s) and waits for one or more replies.
     * The method behaves like a regular blocking RPC method.
     * @param {string|Array} endpoint
     * @param {string} type
     * @param {Object} message
     * @param {function} callback
     * @param {Object|undefined} headers
     */
    sendRequest(endpoint: string | string[], type: string, message: any, callback: MessageHandler, headers?: {
        [k: string]: unknown;
    }): Promise<void>;
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
    publishRequest(type: string, message: any, callback: MessageHandler, expected?: number | null, timeout?: number | null, headers?: {
        [k: string]: unknown;
    }): Promise<void>;
    /**
     * Callback called when consuming a message.  Calls handler callbacks.
     * @param  {Object} message
     * @param  {Object} headers
     * @param  {string} type
     * @return {Promise<Object>} result
     */
    _consumeMessage(message: any, headers: {
        [k: string]: unknown;
    }, type: string): Promise<void>;
    _processFilters(filters: MessageFilter[], message: any, headers: {
        [k: string]: unknown;
    }, type: string): Promise<boolean>;
    /**
     * Finds all handlers interested in the message type and calls handler callback function.
     * @param  {Object} message
     * @param  {Object} headers
     * @param  {string} type
     * @return {List<Promise>}
     * @private
     */
    _processHandlers(message: any, headers: {
        [k: string]: unknown;
    }, type: string): (void | Promise<void>)[];
    /**
     * Finds the callback passed to sendRequest or publishRequest and calls it.
     * @param  {Object} message
     * @param  {Object} headers
     * @param  {Object} type
     * @return {Promise}
     * @private
     */
    _processRequestReplies(message: any, headers: {
        [k: string]: unknown;
    }, type: string): void | Promise<void> | null;
    /**
     * Returns a reply function to be used by handlers.  The reply function will set the ResponseMessageId in the
     * headers and send the reply back to the source address.
     * @param {Object} headers
     * @return {function(*=, *=)}
     * @private
     */
    _getReplyCallback(headers: {
        [k: string]: unknown;
    }): (type: string, message: any) => void;
    /**
     * Disposes of Bus resources.
     */
    close(): Promise<void>;
    private _on;
    private _off;
    private _emit;
    on: (event: string | symbol, listener: (...args: any[]) => void) => this;
    off: (event: string | symbol, listener: (...args: any[]) => void) => this;
    emit: (event: string | symbol, ...args: any[]) => boolean;
}
