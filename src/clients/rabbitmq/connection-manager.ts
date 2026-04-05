import amqp, { AmqpConnectionManager, ChannelWrapper } from 'amqp-connection-manager';
import type { ConfirmChannel } from 'amqplib';
import { ConnectionError, ConnectionErrorCodes } from '../../errors';
import type { BusConfig } from '../../types';

/**
 * Manages AMQP connection lifecycle including reconnection.
 */
export class ConnectionManager {
  private config: BusConfig;
  private connection: AmqpConnectionManager | null = null;
  private channel: ChannelWrapper | null = null;
  private logger: BusConfig['logger'];

  constructor(config: BusConfig) {
    this.config = config;
    this.logger = config.logger;
  }

  /**
   * Connect to RabbitMQ with retry logic
   */
  async connect(): Promise<void> {
    const maxRetries = 5;
    let lastError: Error | undefined;
    const hosts = Array.isArray(this.config.amqpSettings.host)
      ? this.config.amqpSettings.host
      : [this.config.amqpSettings.host];

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.connection = amqp.connect(hosts);
        this.setupConnectionEvents();

        await new Promise<void>((resolve, reject) => {
          this.connection!.on('connect', () => {
            this.logger?.info(`Connected to RabbitMQ: ${this.config.amqpSettings.queue.name}`);
            resolve();
          });

          this.connection!.on('connectFailed', (err) => {
            reject(err.err);
          });

          // Timeout if no connect event within 30 seconds
          setTimeout(() => {
            reject(new Error('Connection timeout'));
          }, 30000);
        });

        return;
      } catch (error) {
        lastError = error as Error;
        this.logger?.error(`Connection attempt ${attempt} failed`, error);

        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
          await this.sleep(delay);
        }
      }
    }

    throw new ConnectionError(
      `Failed to connect to RabbitMQ after ${maxRetries} attempts`,
      ConnectionErrorCodes.CONNECTION_FAILED,
      false,
      lastError
    );
  }

  /**
   * Create a channel with the given setup function
   */
  async createChannel(setup: (channel: ConfirmChannel) => Promise<void>): Promise<void> {
    if (!this.connection) {
      throw new ConnectionError(
        'Not connected to RabbitMQ',
        ConnectionErrorCodes.CONNECTION_FAILED,
        true
      );
    }

    this.channel = this.connection.createChannel({
      json: true,
      setup: async (channel: ConfirmChannel) => {
        await channel.prefetch(this.config.amqpSettings.prefetch);
        await setup(channel);
      }
    });

    // Wait for channel to be ready
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Channel creation timeout'));
      }, 30000);

      this.channel!.on('connect', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.channel!.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  /**
   * Get the current channel
   */
  getChannel(): ChannelWrapper | null {
    return this.channel;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connection?.isConnected() ?? false;
  }

  /**
   * Close connection gracefully
   */
  async close(): Promise<void> {
    try {
      await this.channel?.close();
    } catch {
      // Channel may already be closing/closed, ignore
    }
    try {
      await this.connection?.close();
    } catch {
      // Connection may already be closing/closed, ignore
    }
    this.channel = null;
    this.connection = null;
  }

  /**
   * Setup connection event handlers
   */
  private setupConnectionEvents(): void {
    if (!this.connection) return;

    this.connection.on('disconnect', (err) => {
      this.logger?.error(
        `Disconnected from RabbitMQ: ${this.config.amqpSettings.queue.name}`,
        err.err
      );
    });

    this.connection.on('blocked', (reason) => {
      this.logger?.error(
        `Blocked by RabbitMQ broker: ${this.config.amqpSettings.queue.name}`,
        reason
      );
    });
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
