import { describe, expectTypeOf, it } from 'vitest';
import type { ConcurrencyError, DuplicateSagaError } from '../../src/errors.js';
import type {
  ConcurrencyToken,
  FoundSaga,
  ISagaStore,
  ProcessData,
} from '../../src/persistence/saga-store.js';

interface FooData extends ProcessData {
  status: string;
}

describe('ISagaStore types', () => {
  it('ProcessData carries correlationId', () => {
    expectTypeOf<ProcessData>().toMatchTypeOf<{ correlationId: string }>();
  });

  it('FoundSaga returns data + token', () => {
    expectTypeOf<FoundSaga<FooData>>().toMatchTypeOf<{
      data: FooData;
      concurrencyToken: ConcurrencyToken;
    }>();
  });

  it('ISagaStore exposes findByCorrelationId / insert / update / delete', () => {
    expectTypeOf<ISagaStore['findByCorrelationId']>().toBeFunction();
    expectTypeOf<ISagaStore['insert']>().toBeFunction();
    expectTypeOf<ISagaStore['update']>().toBeFunction();
    expectTypeOf<ISagaStore['delete']>().toBeFunction();
  });

  it('ConcurrencyError + DuplicateSagaError are exported from errors', () => {
    expectTypeOf<ConcurrencyError>().toMatchTypeOf<Error>();
    expectTypeOf<DuplicateSagaError>().toMatchTypeOf<Error>();
  });
});
