import { BusConfig, IBus, IClient, Message, MessageFilter, MessageHandler, ReplyCallback, RequestReplyCallback, ServiceConnectConfig } from './types';
/** Class representing a the message bus. */
export declare class Bus implements IBus {
    id: string;
    requestReplyCallbacks: {
        [MessageId: string]: RequestReplyCallback<Message>;
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
     * Creates and connects to client
     * @return {Promise}
     */
    init(): Promise<void>;
    /**
     * Starts consuming the message type and binds the callback to the message type.
     * @param {String} messageType
     * @param  {Promise} callback
     */
    addHandler<T extends Message>(messageType: string, callback: MessageHandler<T>): Promise<void>;
    /**
     * Removes the message type callback binding and stops listening for the message if there are no more callback
     * bindings.
     * @param {String} messageType
     * @param {Promise}
     */
    removeHandler<T extends Message>(messageType: string, callback: MessageHandler<T>): Promise<void>;
    /**
     * Checks if the message type is being handled by the Bus.
     * @param {String} messageType
     * @return {Boolean}
     */
    isHandled(messageType: string): boolean;
    /**
     * Sends a command to the specified endpoint(s).
     * @param {String|Array} endpoint
     * @param {String} type
     * @param {Object} message
     * @param {Object|undefined} headers
     * @return {Promise}
     */
    send<T extends Message>(endpoint: string | string[], type: string, message: T, headers?: {
        [k: string]: unknown;
    }): Promise<void>;
    /**
     * Publishes an event of the specified type.
     * @param {String} type
     * @param {Object} message
     * @param {Object|undefined} headers
     * @return {Promise}
     */
    publish<T extends Message>(type: string, message: T, headers?: {
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
    sendRequest<T1 extends Message, T2 extends Message>(endpoint: string | string[], type: string, message: T1, callback: MessageHandler<T2>, headers?: {
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
    publishRequest<T1 extends Message, T2 extends Message>(type: string, message: T1, callback: MessageHandler<T2>, expected?: number | null, timeout?: number | null, headers?: {
        [k: string]: unknown;
    }): Promise<void>;
    /**
     * Callback called when consuming a message.  Calls handler callbacks.
     * @param  {Object} message
     * @param  {Object} headers
     * @param  {string} type
     * @return {Promise} result
     */
    _consumeMessage(message: Message, headers: {
        [k: string]: unknown;
    }, type: string): Promise<void>;
    _processFilters(filters: MessageFilter<Message>[], message: Message, headers: {
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
    _processHandlers(message: Message, headers: {
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
    _processRequestReplies(message: Message, headers: {
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
    }): ReplyCallback<Message>;
    /**
     * Returns true if the client is connected
     * @return {Promise<boolean>}
     */
    isConnected(): Promise<boolean>;
    /**
     * Disposes of Bus resources.
     */
    close(): Promise<void>;
}
