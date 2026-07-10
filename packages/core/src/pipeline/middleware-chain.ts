import type { Middleware, PipelineContext } from './index.js';

export function composeMiddleware(
    chain: readonly Middleware[],
): (context: PipelineContext) => Promise<void> {
    return async function run(context: PipelineContext): Promise<void> {
        let index = -1;
        async function dispatch(i: number): Promise<void> {
            if (i <= index) {
                throw new Error('next() called multiple times in middleware');
            }
            index = i;
            const mw = chain[i];
            if (!mw) return;
            await mw(context, () => dispatch(i + 1));
        }
        await dispatch(0);
    };
}
