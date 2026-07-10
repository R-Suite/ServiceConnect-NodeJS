import type { Envelope } from './envelope.js';
import type { Logger } from './logger.js';
import {
    FilterAction,
    type FilterRegistration,
    type Middleware,
    type MiddlewareRegistration,
    type PipelineContext,
    type PipelineStage,
    composeMiddleware,
} from './pipeline/index.js';

export class FilterPipeline {
    private readonly filters: FilterRegistration[] = [];
    private readonly middleware: Middleware[] = [];

    constructor(public readonly stage: PipelineStage) {}

    add(item: FilterRegistration | MiddlewareRegistration): void {
        if (item.kind === 'filter') {
            this.filters.push(item);
        } else {
            this.middleware.push(item.run);
        }
    }

    async execute(
        envelope: Envelope,
        options: { signal: AbortSignal; logger: Logger },
    ): Promise<FilterAction> {
        for (const filter of this.filters) {
            const result = await filter.run(envelope, options.signal);
            if (result === FilterAction.Stop) {
                return FilterAction.Stop;
            }
        }
        if (this.middleware.length > 0) {
            const ctx: PipelineContext = {
                envelope,
                stage: this.stage,
                signal: options.signal,
                logger: options.logger,
            };
            await composeMiddleware(this.middleware)(ctx);
        }
        return FilterAction.Continue;
    }
}
