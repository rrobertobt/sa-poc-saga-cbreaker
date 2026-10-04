import type { BreakerState, OrderStatus, SagaStatus } from './types';

export const shortId = (id: string) => id.slice(0, 8);

export const time = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleTimeString('es', { hour12: false })}.${String(d.getMilliseconds()).padStart(3, '0')}`;
};

const COLORS: Record<OrderStatus | SagaStatus | BreakerState, string> = {
  PENDING: 'gray',
  CONFIRMED: 'green',
  CANCELLED: 'red',
  STARTED: 'blue',
  COMPENSATING: 'amber',
  COMPLETED: 'green',
  COMPENSATED: 'amber',
  COMPENSATION_FAILED: 'red',
  CLOSED: 'green',
  OPEN: 'red',
  HALF_OPEN: 'yellow',
};

export const statusColor = (status: OrderStatus | SagaStatus | BreakerState) => COLORS[status] ?? 'gray';
