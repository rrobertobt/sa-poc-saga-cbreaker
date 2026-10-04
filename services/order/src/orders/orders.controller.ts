import { Body, Controller, Delete, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { IdempotencyKey } from '../common/idempotency-key.decorator';
import { CreateOrderDto } from './create-order.dto';
import { Order } from './order.entity';
import { PurchaseResult, PurchaseService } from '../saga/purchase.service';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly purchases: PurchaseService,
  ) {}

  @Get()
  list(): Promise<Order[]> {
    return this.orders.list();
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<Order> {
    return this.orders.get(id);
  }

  @Post()
  async create(
    @Body() dto: CreateOrderDto,
    @IdempotencyKey() key: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Omit<PurchaseResult, 'replayed'>> {
    const { order, saga, replayed } = await this.purchases.purchase(dto, key);
    if (replayed) res.status(200).setHeader('Idempotent-Replayed', 'true');
    return { order, saga };
  }

  @Delete(':id')
  cancel(@Param('id') id: string, @Query('reason') reason?: string): Promise<Order> {
    return this.orders.cancel(id, reason);
  }
}
