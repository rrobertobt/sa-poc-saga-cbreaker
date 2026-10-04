import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { isAxiosError, Method } from 'axios';
import { firstValueFrom } from 'rxjs';

export type DownstreamService = 'payment' | 'inventory' | 'shipping';

const BASE_URLS: Record<DownstreamService, string> = {
  payment: process.env.PAYMENT_URL ?? 'http://localhost:3002',
  inventory: process.env.INVENTORY_URL ?? 'http://localhost:3003',
  shipping: process.env.SHIPPING_URL ?? 'http://localhost:3004',
};

// Safety net: on forward calls the effective timeout is the breaker's (3s);
// on compensations (no breaker) it's this one.
const TIMEOUT_MS = 4000;

/** Normalized error for a call to another service. `status` is undefined if there was no HTTP response. */
export class DownstreamError extends Error {
  constructor(
    readonly service: DownstreamService,
    readonly code: string,
    readonly status?: number,
    detail?: string,
  ) {
    super(detail ?? code);
  }

  /** Network errors, timeouts, and 5xx can be transient; 4xx are not. */
  get retryable(): boolean {
    return this.status === undefined || this.status >= 500;
  }

  override toString(): string {
    return this.status ? `${this.code} (${this.status})` : this.code;
  }
}

@Injectable()
export class DownstreamClient {
  constructor(private readonly http: HttpService) {}

  async request<T>(service: DownstreamService, method: Method, path: string, sagaId: string, body?: unknown): Promise<T> {
    try {
      const res = await firstValueFrom(
        this.http.request<T>({
          method,
          url: `${BASE_URLS[service]}${path}`,
          data: body,
          headers: { 'Idempotency-Key': sagaId },
          timeout: TIMEOUT_MS,
        }),
      );
      return res.data;
    } catch (err) {
      throw toDownstreamError(service, err);
    }
  }
}

function toDownstreamError(service: DownstreamService, err: unknown): DownstreamError {
  if (!isAxiosError(err)) return new DownstreamError(service, 'UNKNOWN_ERROR', undefined, String(err));
  if (err.response) {
    const data = err.response.data as { error?: string; message?: unknown } | undefined;
    const message = typeof data?.message === 'string' ? data.message : undefined;
    return new DownstreamError(service, data?.error ?? `HTTP_${err.response.status}`, err.response.status, message);
  }
  if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
    return new DownstreamError(service, 'TIMEOUT', undefined, `Sin respuesta en ${TIMEOUT_MS}ms`);
  }
  return new DownstreamError(service, err.code ?? 'NETWORK_ERROR', undefined, err.message);
}
