import type { Bus } from './index';
import type { Message, MessageFilter } from '../types';
/**
 * Executes filter chains for message processing.
 * Supports before, after, and outgoing filters.
 */
export declare class FilterManager {
    /**
     * Execute a chain of filters on a message
     * @param filters - Array of filter functions to execute
     * @param message - The message being filtered
     * @param headers - Message headers
     * @param type - Message type
     * @param bus - Bus instance for context
     * @returns True if all filters pass, false if any filter rejects
     */
    executeFilters<T extends Message>(filters: MessageFilter<T>[], message: T, headers: Record<string, unknown>, type: string, bus: Bus): Promise<boolean>;
    /**
     * Execute before filters
     * @returns True if message should be processed, false to skip
     */
    executeBefore<T extends Message>(filters: MessageFilter<T>[], message: T, headers: Record<string, unknown>, type: string, bus: Bus): Promise<boolean>;
    /**
     * Execute after filters (post-processing)
     * @returns True if processing completed successfully
     */
    executeAfter<T extends Message>(filters: MessageFilter<T>[], message: T, headers: Record<string, unknown>, type: string, bus: Bus): Promise<boolean>;
    /**
     * Execute outgoing filters (for sent/published messages)
     * @returns True if message should be sent, false to drop
     */
    executeOutgoing<T extends Message>(filters: MessageFilter<T>[], message: T, headers: Record<string, unknown>, type: string, bus: Bus): Promise<boolean>;
}
//# sourceMappingURL=filter-manager.d.ts.map