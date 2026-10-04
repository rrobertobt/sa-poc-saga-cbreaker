import { Injectable } from '@nestjs/common';
import { BreakersService } from '../breakers/breakers.service';
import { DownstreamClient } from '../clients/downstream.client';
import { OrdersService } from '../orders/orders.service';
import { SagaContext, SagaDefinition } from './saga.types';

interface Created {
  id: string;
}

/**
 * Purchase saga steps: createOrder (local) → payment → inventory → shipping.
 * Forward calls go through each service's circuit breaker; compensations go direct
 * (the orchestrator retries them with backoff), because they must be attempted even if the service is failing.
 */
@Injectable()
export class PurchaseSaga implements SagaDefinition {
  constructor(
    private readonly orders: OrdersService,
    private readonly client: DownstreamClient,
    private readonly breakers: BreakersService,
  ) {}

  readonly steps = [
    {
      name: 'createOrder',
      // The PENDING order was already created in POST /orders; this step only confirms it exists.
      execute: async (ctx: SagaContext) => {
        const order = await this.orders.get(ctx.orderId);
        return `orden ${order.id} ${order.status}`;
      },
      compensate: async (ctx: SagaContext) => {
        const order = await this.orders.cancel(ctx.orderId, ctx.failureReason);
        return `orden ${order.status}`;
      },
    },
    {
      name: 'payment',
      execute: async (ctx: SagaContext) => {
        const payment = await this.breakers.fire('payment', ctx.sagaId, () =>
          this.client.request<Created>('payment', 'POST', '/payments', ctx.sagaId, {
            orderId: ctx.orderId,
            amount: ctx.amount,
          }),
        );
        ctx.paymentId = payment.id;
        return `pago ${payment.id} CHARGED`;
      },
      compensate: async (ctx: SagaContext) => {
        await this.client.request('payment', 'POST', `/payments/${ctx.paymentId}/refund`, ctx.sagaId);
        return `pago ${ctx.paymentId} REFUNDED`;
      },
    },
    {
      name: 'inventory',
      execute: async (ctx: SagaContext) => {
        const reservation = await this.breakers.fire('inventory', ctx.sagaId, () =>
          this.client.request<Created>('inventory', 'POST', '/inventory/reserve', ctx.sagaId, {
            orderId: ctx.orderId,
            productId: ctx.productId,
            quantity: ctx.quantity,
          }),
        );
        ctx.reservationId = reservation.id;
        return `reserva ${reservation.id} RESERVED`;
      },
      compensate: async (ctx: SagaContext) => {
        await this.client.request('inventory', 'POST', '/inventory/release', ctx.sagaId, {
          reservationId: ctx.reservationId,
        });
        return `reserva ${ctx.reservationId} RELEASED`;
      },
    },
    {
      name: 'shipping',
      execute: async (ctx: SagaContext) => {
        const shipment = await this.breakers.fire('shipping', ctx.sagaId, () =>
          this.client.request<Created>('shipping', 'POST', '/shipping/schedule', ctx.sagaId, {
            orderId: ctx.orderId,
          }),
        );
        ctx.shipmentId = shipment.id;
        return `envío ${shipment.id} SCHEDULED`;
      },
      compensate: async (ctx: SagaContext) => {
        await this.client.request('shipping', 'DELETE', `/shipping/${ctx.shipmentId}`, ctx.sagaId);
        return `envío ${ctx.shipmentId} CANCELLED`;
      },
    },
  ];

  async onCompleted(ctx: SagaContext): Promise<void> {
    await this.orders.confirm(ctx.orderId);
  }
}
