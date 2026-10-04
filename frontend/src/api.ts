import type { Breaker, Downstream, FaultConfig, Order, Product, PurchaseInput, PurchaseResponse, Saga } from './types';

export const URLS = {
  order: import.meta.env.VITE_ORDER_URL ?? 'http://localhost:3001',
  payment: import.meta.env.VITE_PAYMENT_URL ?? 'http://localhost:3002',
  inventory: import.meta.env.VITE_INVENTORY_URL ?? 'http://localhost:3003',
  shipping: import.meta.env.VITE_SHIPPING_URL ?? 'http://localhost:3004',
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    const b = body as { error?: string; message?: unknown } | null;
    super(b?.error ?? (typeof b?.message === 'string' ? b.message : `HTTP ${status}`));
  }
}

async function request<T>(url: string, init: RequestInit = {}): Promise<{ body: T; headers: Headers }> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init.headers } });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body);
  return { body: body as T, headers: res.headers };
}

const http = async <T>(url: string, init?: RequestInit): Promise<T> => (await request<T>(url, init)).body;

const post = <T>(url: string, body?: unknown, headers?: Record<string, string>) =>
  http<T>(url, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body), headers });

export const api = {
  purchase: async (input: PurchaseInput, idempotencyKey: string) => {
    const { body, headers } = await request<PurchaseResponse>(`${URLS.order}/orders`, {
      method: 'POST',
      body: JSON.stringify(input),
      headers: { 'Idempotency-Key': idempotencyKey },
    });
    return { ...body, replayed: headers.get('Idempotent-Replayed') === 'true' };
  },
  orders: () => http<Order[]>(`${URLS.order}/orders`),
  saga: (id: string) => http<Saga>(`${URLS.order}/sagas/${id}`),
  breakers: () => http<Breaker[]>(`${URLS.order}/breakers`),
  resetBreakers: () => post<Breaker[]>(`${URLS.order}/breakers/reset`),
  faults: (service: Downstream) => http<FaultConfig>(`${URLS[service]}/admin/faults`),
  setFault: (service: Downstream, config: FaultConfig) => post<FaultConfig>(`${URLS[service]}/admin/faults`, config),
  products: () => http<Product[]>(`${URLS.inventory}/inventory/products`),
  resetStock: () => post<Product[]>(`${URLS.inventory}/admin/stock/reset`),
  eventsUrl: `${URLS.order}/events`,
};
