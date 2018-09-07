//@flow
import type { DeduplicationFilterSettings } from "../types/deduplicationFilterSettings"

export interface Presistor {
    messageExists(id: string): Promise<bool>;
    insert(id: string): Promise<void>;
}