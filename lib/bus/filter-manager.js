"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FilterManager = void 0;
/**
 * Executes filter chains for message processing.
 * Supports before, after, and outgoing filters.
 */
class FilterManager {
    /**
     * Execute a chain of filters on a message
     * @param filters - Array of filter functions to execute
     * @param message - The message being filtered
     * @param headers - Message headers
     * @param type - Message type
     * @param bus - Bus instance for context
     * @returns True if all filters pass, false if any filter rejects
     */
    async executeFilters(filters, message, headers, type, bus) {
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
    async executeBefore(filters, message, headers, type, bus) {
        return this.executeFilters(filters, message, headers, type, bus);
    }
    /**
     * Execute after filters (post-processing)
     * @returns True if processing completed successfully
     */
    async executeAfter(filters, message, headers, type, bus) {
        return this.executeFilters(filters, message, headers, type, bus);
    }
    /**
     * Execute outgoing filters (for sent/published messages)
     * @returns True if message should be sent, false to drop
     */
    async executeOutgoing(filters, message, headers, type, bus) {
        return this.executeFilters(filters, message, headers, type, bus);
    }
}
exports.FilterManager = FilterManager;
//# sourceMappingURL=filter-manager.js.map