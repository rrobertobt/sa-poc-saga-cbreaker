import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ServiceUnavailableError } from '../breakers/breakers.service';
import { DownstreamError } from '../clients/downstream.client';
import { log } from '../common/logger';
import { retryWithBackoff } from '../common/retry';
import { EventsService } from '../events/events.service';
import { SagaExecution, SagaLogEntry, SagaStatus } from './saga-execution.entity';
import { SagaContext, SagaDefinition, SagaStep } from './saga.types';

const COMPENSATION_ATTEMPTS = 3;
const COMPENSATION_BASE_DELAY_MS = 500;

function describeError(err: unknown): string {
  if (err instanceof DownstreamError || err instanceof ServiceUnavailableError) return err.toString();
  if (err instanceof Error) return err.message;
  return String(err);
}

@Injectable()
export class SagaOrchestrator {
  constructor(
    @InjectRepository(SagaExecution) private readonly sagas: Repository<SagaExecution>,
    private readonly events: EventsService,
  ) {}

  list(): Promise<SagaExecution[]> {
    return this.sagas.find({ order: { createdAt: 'DESC' } });
  }

  async get(id: string): Promise<SagaExecution> {
    const saga = await this.sagas.findOneBy({ id });
    if (!saga) throw new NotFoundException({ error: 'SAGA_NOT_FOUND', message: `Saga ${id} no existe` });
    return saga;
  }

  /**
   * Runs the steps in order. If one fails, compensates the completed ones in reverse order.
   * Each transition is persisted in `saga_executions` and emitted via SSE.
   */
  async run(ctx: SagaContext, definition: SagaDefinition): Promise<SagaExecution> {
    const saga = this.sagas.create({
      id: ctx.sagaId,
      orderId: ctx.orderId,
      status: 'STARTED',
      context: ctx,
      completedSteps: [],
      log: [],
      failureReason: null,
    });
    await this.transition(saga, 'STARTED', `saga iniciada: ${ctx.productId} x${ctx.quantity} por ${ctx.amount}`);

    const completed: SagaStep[] = [];
    for (const step of definition.steps) {
      try {
        const detail = await step.execute(ctx);
        completed.push(step);
        saga.completedSteps.push(step.name);
        await this.record(saga, ctx, { step: step.name, action: 'execute', result: 'success', message: detail || 'OK' });
      } catch (err) {
        const reason = `${step.name}: ${describeError(err)}`;
        await this.record(saga, ctx, { step: step.name, action: 'execute', result: 'failure', message: describeError(err) });
        return this.compensate(saga, ctx, completed, reason);
      }
    }

    await definition.onCompleted?.(ctx);
    return this.transition(saga, 'COMPLETED', 'saga completada');
  }

  private async compensate(
    saga: SagaExecution,
    ctx: SagaContext,
    completed: SagaStep[],
    reason: string,
  ): Promise<SagaExecution> {
    ctx.failureReason = reason;
    saga.failureReason = reason;
    await this.transition(saga, 'COMPENSATING', `compensando ${completed.length} paso(s) por fallo en ${reason}`);

    let allCompensated = true;
    for (const step of [...completed].reverse()) {
      try {
        // Compensations don't go through the circuit breaker: they're retried even if the service is failing.
        const detail = await retryWithBackoff(() => step.compensate(ctx), {
          attempts: COMPENSATION_ATTEMPTS,
          baseDelayMs: COMPENSATION_BASE_DELAY_MS,
          shouldRetry: (err) => !(err instanceof DownstreamError) || err.retryable,
          onRetry: (err, attempt, delayMs) =>
            this.record(saga, ctx, {
              step: step.name,
              action: 'compensate',
              result: 'retry',
              attempt,
              message: `intento ${attempt}/${COMPENSATION_ATTEMPTS} falló (${describeError(err)}), reintento en ${delayMs}ms`,
            }),
        });
        await this.record(saga, ctx, { step: step.name, action: 'compensate', result: 'success', message: detail || 'OK' });
      } catch (err) {
        // The rest of the steps keep getting compensated; the saga is left for manual review.
        allCompensated = false;
        await this.record(saga, ctx, {
          step: step.name,
          action: 'compensate',
          result: 'failure',
          message: `compensación fallida tras ${COMPENSATION_ATTEMPTS} intentos: ${describeError(err)}`,
        });
      }
    }

    return allCompensated
      ? this.transition(saga, 'COMPENSATED', `saga compensada (${reason})`)
      : this.transition(saga, 'COMPENSATION_FAILED', 'una o más compensaciones fallaron: requiere revisión manual');
  }

  private async transition(saga: SagaExecution, status: SagaStatus, message: string): Promise<SagaExecution> {
    saga.status = status;
    await this.sagas.save(saga);
    log(saga.id, `saga ${status}: ${message}`);
    this.events.emit({ type: 'saga', kind: 'status', sagaId: saga.id, status, message });
    return saga;
  }

  private async record(saga: SagaExecution, ctx: SagaContext, entry: Omit<SagaLogEntry, 'at'>): Promise<void> {
    const full: SagaLogEntry = { at: new Date().toISOString(), ...entry };
    saga.log.push(full);
    saga.context = ctx;
    await this.sagas.save(saga);
    const verb = entry.action === 'execute' ? 'ejecutar' : 'compensar';
    log(saga.id, `${verb} ${entry.step} -> ${entry.result.toUpperCase()}: ${entry.message}`);
    this.events.emit({ type: 'saga', kind: 'step', sagaId: saga.id, status: saga.status, ...full });
  }
}
