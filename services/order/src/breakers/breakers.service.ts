import { Injectable, OnModuleDestroy } from '@nestjs/common';
import CircuitBreaker from 'opossum';
import { DownstreamError, DownstreamService } from '../clients/downstream.client';
import { log } from '../common/logger';
import { EventsService } from '../events/events.service';

/** Assignment spec configuration mapped to opossum (see docs/breaker-differences.md). */
export const BREAKER_OPTIONS = {
  errorThresholdPercentage: 50, // failureRateThreshold = 50%
  resetTimeout: 10_000, // waitDurationInOpenState = 10s
  volumeThreshold: 10, // slidingWindowSize = 10 (minimum calls to evaluate)
  rollingCountTimeout: 10_000, // time-based sliding window: 10s...
  rollingCountBuckets: 10, // ...in 10 buckets of 1s
  timeout: 3000, // complementary: a slow call counts as a failure
} as const;

const SERVICES: DownstreamService[] = ['payment', 'inventory', 'shipping'];

export type BreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface BreakerCounters {
  fires: number;
  successes: number;
  failures: number;
  rejects: number;
  timeouts: number;
  fallbacks: number;
}

export interface BreakerSnapshot {
  name: DownstreamService;
  state: BreakerState;
  /** Counters from opossum's sliding window (last 10s). */
  stats: BreakerCounters;
  /** Cumulative counters since the service started (or since the last reset). */
  totals: BreakerCounters;
  options: typeof BREAKER_OPTIONS;
}

/** Thrown from the fallback when the circuit is open and the call is rejected without reaching the service. */
export class ServiceUnavailableError extends Error {
  constructor(readonly service: DownstreamService) {
    super('Servicio no disponible, intente más tarde');
    this.name = 'ServiceUnavailableError';
  }

  override toString(): string {
    return `CIRCUIT_OPEN: ${this.message}`;
  }
}

// The breaker action receives the sagaId (only for logs) and the HTTP call to protect.
type Call = () => Promise<unknown>;
type Breaker = CircuitBreaker<[sagaId: string, call: Call], unknown>;

const emptyCounters = (): BreakerCounters => ({ fires: 0, successes: 0, failures: 0, rejects: 0, timeouts: 0, fallbacks: 0 });

/** One circuit breaker per dependency. Only protects the saga's forward calls. */
@Injectable()
export class BreakersService implements OnModuleDestroy {
  private readonly breakers = new Map<DownstreamService, Breaker>();
  private readonly totals = new Map<DownstreamService, BreakerCounters>();

  constructor(private readonly events: EventsService) {
    SERVICES.forEach((service) => this.create(service));
  }

  async fire<T>(service: DownstreamService, sagaId: string, call: () => Promise<T>): Promise<T> {
    return (await this.breakers.get(service)!.fire(sagaId, call)) as T;
  }

  snapshot(): BreakerSnapshot[] {
    return SERVICES.map((service) => {
      const breaker = this.breakers.get(service)!;
      const { fires, successes, failures, rejects, timeouts, fallbacks } = breaker.stats;
      return {
        name: service,
        state: stateOf(breaker),
        stats: { fires, successes, failures, rejects, timeouts, fallbacks },
        totals: { ...this.totals.get(service)! },
        options: BREAKER_OPTIONS,
      };
    });
  }

  /** Recreates the breakers (CLOSED state and counters at zero) to repeat scenarios. */
  reset(): BreakerSnapshot[] {
    this.breakers.forEach((breaker) => breaker.shutdown());
    SERVICES.forEach((service) => this.create(service));
    log(null, 'breakers reiniciados -> CLOSED');
    this.events.emit({ type: 'breaker', event: 'reset', breakers: this.snapshot() });
    return this.snapshot();
  }

  onModuleDestroy(): void {
    this.breakers.forEach((breaker) => breaker.shutdown());
  }

  private create(service: DownstreamService): void {
    const breaker: Breaker = new CircuitBreaker((_sagaId: string, call: Call) => call(), {
      ...BREAKER_OPTIONS,
      name: service,
      // 4xx errors are business errors (e.g. OUT_OF_STOCK): the service responds fine, they shouldn't open the circuit.
      errorFilter: (err: unknown) => err instanceof DownstreamError && err.status !== undefined && err.status < 500,
    });

    // opossum calls the fallback on any failure, not only when the circuit is open.
    // Only rejections due to an open circuit become ServiceUnavailableError; the rest keep their original cause.
    // It's async on purpose: if the fallback throws synchronously, opossum doesn't emit the 'fallback' event.
    breaker.fallback(async (sagaId: string, _call: Call, err: Error & { code?: string }) => {
      if (err.code === 'EOPENBREAKER') {
        log(sagaId, `breaker ${service} OPEN -> fallback: "Servicio no disponible, intente más tarde" (no se llama a ${service})`);
        throw new ServiceUnavailableError(service);
      }
      if (err.code === 'ETIMEDOUT') {
        throw new DownstreamError(service, 'TIMEOUT', undefined, `Sin respuesta en ${BREAKER_OPTIONS.timeout}ms (breaker)`);
      }
      throw err;
    });

    this.breakers.set(service, breaker);
    this.totals.set(service, emptyCounters());
    const totals = this.totals.get(service)!;
    const notify = (event: string, message: string, sagaId?: string) => {
      log(sagaId, `breaker ${service} [${stateOf(breaker)}] ${event}: ${message}`);
      this.events.emit({
        type: 'breaker',
        event,
        breaker: service,
        state: stateOf(breaker),
        sagaId,
        message,
        breakers: this.snapshot(),
      });
    };

    breaker.on('fire', () => totals.fires++);
    breaker.on('open', () =>
      notify('open', `circuito ABIERTO: más del ${BREAKER_OPTIONS.errorThresholdPercentage}% de fallos; se rechaza durante ${BREAKER_OPTIONS.resetTimeout / 1000}s`),
    );
    breaker.on('halfOpen', () => notify('halfOpen', 'circuito HALF-OPEN: se permite 1 llamada de prueba'));
    breaker.on('close', () => notify('close', 'circuito CERRADO: el servicio respondió bien'));
    breaker.on('success', (result: unknown) => {
      totals.successes++;
      if (result instanceof DownstreamError) notify('success', `error de negocio ${result.toString()} (no cuenta como fallo)`);
      else notify('success', 'llamada OK');
    });
    breaker.on('failure', (err, _latency, [sagaId]) => {
      totals.failures++;
      notify('failure', err instanceof DownstreamError ? err.toString() : err.message, sagaId);
    });
    // @types/opossum declares (err), but opossum emits (err, latency, args).
    const onTimeout = (_err: Error, latency: number, args: [string, Call]) => {
      totals.timeouts++;
      notify('timeout', `sin respuesta tras ${latency}ms`, args[0]);
    };
    breaker.on('timeout', onTimeout as unknown as (err: Error) => void);
    breaker.on('reject', () => {
      totals.rejects++;
      notify('reject', 'llamada rechazada sin llegar al servicio');
    });
    breaker.on('fallback', () => {
      totals.fallbacks++;
    });
  }
}

function stateOf(breaker: Breaker): BreakerState {
  if (breaker.opened) return 'OPEN';
  if (breaker.halfOpen) return 'HALF_OPEN';
  return 'CLOSED';
}
