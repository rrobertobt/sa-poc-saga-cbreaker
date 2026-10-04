// Types mirroring the services' responses.

export type Downstream = 'payment' | 'inventory' | 'shipping';
export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED';
export type SagaStatus = 'STARTED' | 'COMPENSATING' | 'COMPLETED' | 'COMPENSATED' | 'COMPENSATION_FAILED';
export type BreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';
export type FaultMode = 'none' | 'error' | 'slow' | 'down';

export interface Order {
  id: string;
  productId: string;
  quantity: number;
  amount: number;
  status: OrderStatus;
  failureReason: string | null;
  createdAt: string;
}

export interface SagaLogEntry {
  at: string;
  step: string;
  action: 'execute' | 'compensate';
  result: 'success' | 'failure' | 'retry';
  message: string;
  attempt?: number;
}

export interface Saga {
  id: string;
  orderId: string;
  status: SagaStatus;
  completedSteps: string[];
  log: SagaLogEntry[];
  failureReason: string | null;
  createdAt: string;
}

export interface BreakerCounters {
  fires: number;
  successes: number;
  failures: number;
  rejects: number;
  timeouts: number;
  fallbacks: number;
}

export interface Breaker {
  name: Downstream;
  state: BreakerState;
  stats: BreakerCounters;
  totals: BreakerCounters;
  options: { resetTimeout: number; volumeThreshold: number; errorThresholdPercentage: number; timeout: number };
}

export interface FaultConfig {
  mode: FaultMode;
  delayMs: number;
}

export interface Product {
  sku: string;
  name: string;
  stock: number;
}

export interface PurchaseInput {
  productId: string;
  quantity: number;
  amount: number;
}

export interface PurchaseResponse {
  order: Order;
  saga: Saga | null;
}

export interface SagaEvent {
  type: 'saga';
  kind: 'status' | 'step';
  sagaId: string;
  status: SagaStatus;
  at: string;
  message: string;
  step?: string;
  action?: string;
  result?: string;
}

export interface BreakerEvent {
  type: 'breaker';
  event: string;
  breaker?: Downstream;
  state?: BreakerState;
  sagaId?: string;
  message?: string;
  at: string;
  breakers?: Breaker[];
}

export type AppEvent = SagaEvent | BreakerEvent;
