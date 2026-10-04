import { Injectable } from '@nestjs/common';
import { CreateOrderDto } from '../orders/create-order.dto';
import { Order } from '../orders/order.entity';
import { OrdersService } from '../orders/orders.service';
import { PurchaseSaga } from './purchase.saga';
import { SagaExecution } from './saga-execution.entity';
import { SagaOrchestrator } from './saga-orchestrator.service';

export interface PurchaseResult {
  order: Order;
  saga: SagaExecution | null;
  replayed: boolean;
}

/** POST /orders: creates the PENDING order and runs the purchase saga to completion. */
@Injectable()
export class PurchaseService {
  constructor(
    private readonly orders: OrdersService,
    private readonly orchestrator: SagaOrchestrator,
    private readonly purchaseSaga: PurchaseSaga,
  ) {}

  async purchase(dto: CreateOrderDto, key: string): Promise<PurchaseResult> {
    const { order, replayed } = await this.orders.create(dto, key);
    if (replayed) {
      // Same Idempotency-Key: no new saga is launched, the current state is returned.
      const saga = await this.orchestrator.get(order.id).catch(() => null);
      return { order, saga, replayed };
    }

    const saga = await this.orchestrator.run(
      { sagaId: order.id, orderId: order.id, productId: order.productId, quantity: order.quantity, amount: order.amount },
      this.purchaseSaga,
    );
    return { order: await this.orders.get(order.id), saga, replayed };
  }
}
