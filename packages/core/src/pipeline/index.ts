import type { Envelope } from '../envelope.js';
import type { Logger } from '../logger.js';

export const FilterAction = {
    Continue: 'Continue',
    Stop: 'Stop',
} as const;
export type FilterAction = (typeof FilterAction)[keyof typeof FilterAction];

export type PipelineStage =
    | 'outgoing'
    | 'beforeConsuming'
    | 'afterConsuming'
    | 'onConsumedSuccessfully';

export interface PipelineContext {
    readonly envelope: Envelope;
    readonly stage: PipelineStage;
    readonly signal: AbortSignal;
    readonly logger: Logger;
}

export type Filter = (
    envelope: Envelope,
    signal: AbortSignal,
) => Promise<FilterAction> | FilterAction;

export type Middleware = (context: PipelineContext, next: () => Promise<void>) => Promise<void>;

export interface FilterRegistration {
    readonly kind: 'filter';
    readonly run: Filter;
}

export interface MiddlewareRegistration {
    readonly kind: 'middleware';
    readonly run: Middleware;
}

export function asFilter(fn: Filter): FilterRegistration {
    return { kind: 'filter', run: fn };
}

export function asMiddleware(fn: Middleware): MiddlewareRegistration {
    return { kind: 'middleware', run: fn };
}

export { composeMiddleware } from './middleware-chain.js';
