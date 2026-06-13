export interface ProcessData {
    correlationId: string;
}

export type ConcurrencyToken = string;

export interface FoundSaga<TData extends ProcessData> {
    readonly data: TData;
    readonly concurrencyToken: ConcurrencyToken;
}

export interface ISagaStore {
    findByCorrelationId<TData extends ProcessData>(
        dataType: string,
        correlationId: string,
    ): Promise<FoundSaga<TData> | undefined>;

    insert<TData extends ProcessData>(dataType: string, data: TData): Promise<ConcurrencyToken>;

    update<TData extends ProcessData>(
        dataType: string,
        data: TData,
        expectedToken: ConcurrencyToken,
    ): Promise<ConcurrencyToken>;

    delete(dataType: string, correlationId: string): Promise<void>;
}
