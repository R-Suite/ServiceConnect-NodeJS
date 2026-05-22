import type { AggregatorBranchOutcome } from '../aggregator/dispatch.js';
import type { Bus } from '../bus.js';
import { createConsumeContext } from '../consume-context.js';
import type { Envelope } from '../envelope.js';
import { TerminalDeserializationError, ValidationError } from '../errors.js';
import type { FilterPipeline } from '../filter-pipeline.js';
import type { Logger } from '../logger.js';
import type { MessageHeaders } from '../message.js';
import { FilterAction } from '../pipeline/index.js';
import type { SagaBranchOutcome } from '../process/dispatch.js';
import type { RequestReplyManager } from '../request-reply.js';
import type { IMessageTypeRegistry } from '../serialization/registry.js';
import type { IMessageSerializer } from '../serialization/serializer.js';
import type { StreamBranchOutcome } from '../streaming/dispatch.js';
import type { ConsumeCallback, ConsumeResult } from '../transport.js';
import type { HandlerRegistry } from './registry.js';

export interface DispatcherDeps {
  bus: Bus;
  logger: Logger;
  registry: IMessageTypeRegistry;
  serializer: IMessageSerializer;
  handlers: HandlerRegistry;
  pipelines: {
    before: FilterPipeline;
    after: FilterPipeline;
    onSuccess: FilterPipeline;
  };
  requestReplyManager?: RequestReplyManager;
  streamBranch?: (envelope: Envelope) => Promise<StreamBranchOutcome>;
  sagaBranch?: (
    envelope: Envelope,
    message: object,
    signal: AbortSignal,
  ) => Promise<SagaBranchOutcome>;
  aggregatorBranch?: (
    envelope: Envelope,
    message: object,
    signal: AbortSignal,
  ) => Promise<AggregatorBranchOutcome>;
  routingForward?: (envelope: Envelope, handlerSucceeded: boolean) => Promise<boolean>;
}

export function createDispatcher(deps: DispatcherDeps): ConsumeCallback {
  return async function dispatch(envelope: Envelope, signal: AbortSignal): Promise<ConsumeResult> {
    const headers = envelope.headers as MessageHeaders;
    const messageType = typeof headers.messageType === 'string' ? headers.messageType : '';

    // Step 1: type registered?
    if (!messageType || !deps.registry.resolve(messageType)) {
      deps.logger.debug('dispatcher: unknown message type', { messageType });
      return { success: true, notHandled: true, terminalFailure: false };
    }

    // Step 2: beforeConsuming pipeline
    try {
      const action = await deps.pipelines.before.execute(envelope, { signal, logger: deps.logger });
      if (action === FilterAction.Stop) {
        // afterConsuming runs unconditionally — also on a clean Stop short-circuit.
        await runAfterSafe(deps, envelope, signal);
        return { success: true, notHandled: false, terminalFailure: false };
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      // afterConsuming always runs (best effort)
      await runAfterSafe(deps, envelope, signal);
      return { success: false, notHandled: false, error: err, terminalFailure: false };
    }

    // Phase E stream-branch. Runs before deserialization because stream chunks (end-of-stream,
    // fault) may carry empty or absent bodies that would fail JSON.parse. The branch performs
    // its own selective deserialization for data-bearing chunks only.
    if (deps.streamBranch) {
      const streamOutcome = await deps.streamBranch(envelope);
      if (streamOutcome.ran && streamOutcome.result) {
        await runAfterSafe(deps, envelope, signal);
        return streamOutcome.result;
      }
    }

    // Step 3: deserialize
    let message: object;
    try {
      message = deps.serializer.deserialize(envelope.body, messageType);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      await runAfterSafe(deps, envelope, signal);
      const isTerminal =
        err instanceof TerminalDeserializationError || err instanceof ValidationError;
      return { success: false, notHandled: false, error: err, terminalFailure: isTerminal };
    }

    // Phase D: reply-branch. If this envelope is a reply correlated to a pending request,
    // route it to the manager and skip the handler chain. afterConsuming still runs.
    if (deps.requestReplyManager) {
      const matched = deps.requestReplyManager.tryRouteReply(
        envelope,
        message as { correlationId: string },
      );
      if (matched) {
        await runAfterSafe(deps, envelope, signal);
        return { success: true, notHandled: false, terminalFailure: false };
      }
    }

    // Phase E saga-branch. Runs only when a saga registration matches.
    if (deps.sagaBranch) {
      const sagaOutcome = await deps.sagaBranch(envelope, message, signal);
      if (sagaOutcome.ran && sagaOutcome.result) {
        await runAfterSafe(deps, envelope, signal);
        return sagaOutcome.result;
      }
    }

    // Phase E aggregator-branch. Short-circuits if a registration matches.
    if (deps.aggregatorBranch) {
      const aggOutcome = await deps.aggregatorBranch(envelope, message, signal);
      if (aggOutcome.ran && aggOutcome.result) {
        await runAfterSafe(deps, envelope, signal);
        return aggOutcome.result;
      }
    }

    // Step 4: resolve handlers
    const ctx = createConsumeContext({ bus: deps.bus, headers, signal, logger: deps.logger });
    const resolved = deps.handlers.handlersFor(messageType, ctx);
    if (resolved.length === 0) {
      await runAfterSafe(deps, envelope, signal);
      return { success: true, notHandled: true, terminalFailure: false };
    }

    // Step 5: invoke handlers in registration order
    let handlerError: Error | undefined;
    try {
      for (const h of resolved) {
        await h(message as never, ctx);
      }
    } catch (error) {
      handlerError = error instanceof Error ? error : new Error(String(error));
    }

    // Step 6: onConsumedSuccessfully (only on success)
    let successPipelineError: Error | undefined;
    if (!handlerError) {
      try {
        await deps.pipelines.onSuccess.execute(envelope, { signal, logger: deps.logger });
      } catch (error) {
        successPipelineError = error instanceof Error ? error : new Error(String(error));
      }
    }

    // Phase E routing-slip forward hook (after success pipeline, before after-pipeline)
    if (deps.routingForward) {
      const handlerSucceeded = !handlerError && !successPipelineError;
      try {
        await deps.routingForward(envelope, handlerSucceeded);
      } catch (err) {
        deps.logger.warn('routing slip forward threw; result preserved', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Step 7: afterConsuming (always)
    await runAfterSafe(deps, envelope, signal);

    // Step 8: classify result
    if (handlerError) {
      return { success: false, notHandled: false, error: handlerError, terminalFailure: false };
    }
    if (successPipelineError) {
      return {
        success: false,
        notHandled: false,
        error: successPipelineError,
        terminalFailure: false,
      };
    }
    return { success: true, notHandled: false, terminalFailure: false };
  };
}

async function runAfterSafe(
  deps: DispatcherDeps,
  envelope: Envelope,
  signal: AbortSignal,
): Promise<void> {
  try {
    await deps.pipelines.after.execute(envelope, { signal, logger: deps.logger });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    deps.logger.warn('afterConsuming threw; result preserved', { error: err.message });
  }
}
