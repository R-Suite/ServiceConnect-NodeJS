import type { BusConfig, ConsumeMessageCallback, IClient } from '../types';

/**
 * Core Bus functionality - configuration and client management.
 */
export class BusCore {
  public config: BusConfig;
  public client: IClient | null = null;
  public initialized = false;

  constructor(config: BusConfig) {
    this.config = config;
  }

  /**
   * Initialize the bus by creating and connecting to the client
   */
  async init(consumeCallback: ConsumeMessageCallback): Promise<void> {
    const ClientConstructor = this.config.client;
    this.client = new ClientConstructor(this.config, consumeCallback);
    await this.client.connect();
    this.initialized = true;
  }

  /**
   * Close the bus and cleanup resources
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
    }
    this.initialized = false;
    this.client = null;
  }

  /**
   * Check if the client is connected
   */
  async isConnected(): Promise<boolean> {
    if (!this.client) {
      return false;
    }
    return this.client.isConnected();
  }
}
