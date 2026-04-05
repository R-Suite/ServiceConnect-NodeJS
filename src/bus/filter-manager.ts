import type { Bus } from './index';
import type { Message, MessageFilter } from '../types';

/**
 * Executes filter chains for message processing.
 * Supports before, after, and outgoing filters.
 */
export class FilterManager {
  /**
   * Execute a chain of filters on a message
   * @param filters - Array of filter functions to execute
   * @param message - The message being filtered
   * @param headers - Message headers
   * @param type - Message type
   * @param bus - Bus instance for context
   * @returns True if all filters pass, false if any filter rejects
   */
  async executeFilters<T extends Message>(
    filters: MessageFilter<T>[],
    message: T,
    headers: Record<string, unknown>,
    type: string,
    bus: Bus
  ): Promise<boolean> {
    for (const filter of filters) {
      const result = await filter(message, headers, type, bus);
      if (result === false) {
        return false;
      }
    }
    return true;
  }

  /**
   * Execute before filters
   * @returns True if message should be processed, false to skip
   */
  async executeBefore<T extends Message>(
    filters: MessageFilter<T>[],
    message: T,
    headers: Record<string, unknown>,
    type: string,
    bus: Bus
  ): Promise<boolean> {
    return this.executeFilters(filters, message, headers, type, bus);
  }

  /**
   * Execute after filters (post-processing)
   * @returns True if processing completed successfully
   */
  async executeAfter<T extends Message>(
    filters: MessageFilter<T>[],
    message: T,
    headers: Record<string, unknown>,
    type: string,
    bus: Bus
  ): Promise<boolean> {
    return this.executeFilters(filters, message, headers, type, bus);
  }

  /**
   * Execute outgoing filters (for sent/published messages)
   * @returns True if message should be sent, false to drop
   */
  async executeOutgoing<T extends Message>(
    filters: MessageFilter<T>[],
    message: T,
    headers: Record<string, unknown>,
    type: string,
    bus: Bus
  ): Promise<boolean> {
    return this.executeFilters(filters, message, headers, type, bus);
  }
}
