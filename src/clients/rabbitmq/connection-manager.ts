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
    const maxRetries = this.config.amqpSettings.connectionMaxRetries;
    let lastError: Error | undefined;
    const hosts = Array.isArray(this.config.amqpSettings.host)
      ? this.config.amqpSettings.host
      : [this.config.amqpSettings.host];

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      // Clean up previous connection attempt if any
      if (this.connection) {
        try {
          await this.connection.close();
        } catch {
          // Ignore close errors during retry
        }
        this.connection = null;
      }

      try {
        const connectionOptions: Record<string, unknown> = {};
        if (this.config.amqpSettings.ssl?.enabled) {
          const ssl = this.config.amqpSettings.ssl;
          const tlsOptions: Record<string, unknown> = {};
          if (ssl.cert) tlsOptions.cert = ssl.cert;
          if (ssl.key) tlsOptions.key = ssl.key;
          if (ssl.ca) tlsOptions.ca = ssl.ca;
          if (ssl.pfx) tlsOptions.pfx = ssl.pfx;
          if (ssl.passphrase) tlsOptions.passphrase = ssl.passphrase;
          tlsOptions.rejectUnauthorized = ssl.verify !== 'verify_none';
          connectionOptions.connectionOptions = tlsOptions;
        }

        this.connection = amqp.connect(hosts, connectionOptions);
        this.setupConnectionEvents();

        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Connection timeout'));
          }, this.config.amqpSettings.connectionTimeout);

          this.connection!.once('connect', () => {
            clearTimeout(timeout);
            this.logger?.info(`Connected to RabbitMQ: ${this.config.amqpSettings.queue.name}`);
            resolve();
          });

          this.connection!.once('connectFailed', (err) => {
            clearTimeout(timeout);
            reject(err.err);
          });
        });

        return;
      } catch (error) {
        lastError = error as Error;
        this.logger?.error(`Connection attempt ${attempt} failed`, error);

        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), this.config.amqpSettings.connectionRetryDelay);
          await this.sleep(delay);
        }
      }
    }

    // Clean up last failed connection attempt
    if (this.connection) {
      try {
        await this.connection.close();
      } catch {
        // Ignore close errors during cleanup
      }
      this.connection = null;
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
      setup: async (channel: ConfirmChannel) => {
        await channel.prefetch(this.config.amqpSettings.prefetch);
        await setup(channel);
      }
    });

    // Wait for channel to be ready
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Channel creation timeout'));
      }, this.config.amqpSettings.connectionTimeout);

      this.channel!.once('connect', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.channel!.once('error', (err) => {
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
