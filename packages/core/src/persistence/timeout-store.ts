export interface TimeoutRecord {
    readonly id: string;
    readonly name: string;
    readonly sagaCorrelationId: string;
    readonly sagaDataType: string;
    readonly runAt: Date;
    readonly payload?: Readonly<Record<string, unknown>>;
}

export interface ITimeoutStore {
    schedule(record: Omit<TimeoutRecord, 'id'>): Promise<TimeoutRecord>;
    claimDue(now: Date, limit: number): Promise<readonly TimeoutRecord[]>;
    delete(id: string): Promise<void>;
}
