import type { BusConfig, ConsumeMessageCallback, IClient } from '../types';
/**
 * Core Bus functionality - configuration and client management.
 */
export declare class BusCore {
    config: BusConfig;
    client: IClient | null;
    initialized: boolean;
    constructor(config: BusConfig);
    /**
     * Initialize the bus by creating and connecting to the client
     */
    init(consumeCallback: ConsumeMessageCallback): Promise<void>;
    /**
     * Close the bus and cleanup resources
     */
    close(): Promise<void>;
    /**
     * Check if the client is connected
     */
    isConnected(): Promise<boolean>;
}
//# sourceMappingURL=bus-core.d.ts.map