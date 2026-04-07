"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BusCore = void 0;
/**
 * Core Bus functionality - configuration and client management.
 */
class BusCore {
    config;
    client = null;
    initialized = false;
    constructor(config) {
        this.config = config;
    }
    /**
     * Initialize the bus by creating and connecting to the client
     */
    async init(consumeCallback) {
        const ClientConstructor = this.config.client;
        this.client = new ClientConstructor(this.config, consumeCallback);
        await this.client.connect();
        this.initialized = true;
    }
    /**
     * Close the bus and cleanup resources
     */
    async close() {
        if (this.client) {
            await this.client.close();
        }
        this.initialized = false;
        this.client = null;
    }
    /**
     * Check if the client is connected
     */
    async isConnected() {
        if (!this.client) {
            return false;
        }
        return this.client.isConnected();
    }
}
exports.BusCore = BusCore;
//# sourceMappingURL=bus-core.js.map