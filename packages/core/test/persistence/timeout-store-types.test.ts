import { describe, expectTypeOf, it } from 'vitest';
import type { ITimeoutStore, TimeoutRecord } from '../../src/persistence/timeout-store.js';

describe('ITimeoutStore types', () => {
    it('TimeoutRecord carries id, name, saga correlation, runAt, optional payload', () => {
        expectTypeOf<TimeoutRecord>().toMatchTypeOf<{
            id: string;
            name: string;
            sagaCorrelationId: string;
            sagaDataType: string;
            runAt: Date;
            payload?: Readonly<Record<string, unknown>>;
        }>();
    });

    it('ITimeoutStore exposes schedule / claimDue / delete', () => {
        expectTypeOf<ITimeoutStore['schedule']>().toBeFunction();
        expectTypeOf<ITimeoutStore['claimDue']>().toBeFunction();
        expectTypeOf<ITimeoutStore['delete']>().toBeFunction();
    });

    it('schedule accepts a record without an id and returns one with an id', () => {
        type ScheduleParam = Parameters<ITimeoutStore['schedule']>[0];
        expectTypeOf<ScheduleParam>().toMatchTypeOf<Omit<TimeoutRecord, 'id'>>();
        type ScheduleResult = Awaited<ReturnType<ITimeoutStore['schedule']>>;
        expectTypeOf<ScheduleResult>().toMatchTypeOf<TimeoutRecord>();
    });
});
