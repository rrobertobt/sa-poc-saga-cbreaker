import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { log } from '../common/logger';
import { CreateOrderDto } from './create-order.dto';
import { Order } from './order.entity';

@Injectable()
export class OrdersService {
  constructor(@InjectRepository(Order) private readonly orders: Repository<Order>) {}

  list(): Promise<Order[]> {
    return this.orders.find({ order: { createdAt: 'DESC' } });
  }

  async get(id: string): Promise<Order> {
    const order = await this.orders.findOneBy({ id });
    if (!order) throw new NotFoundException({ error: 'ORDER_NOT_FOUND', message: `Orden ${id} no existe` });
    return order;
  }

  async create(dto: CreateOrderDto, key: string): Promise<{ order: Order; replayed: boolean }> {
    const existing = await this.orders.findOneBy({ idempotencyKey: key });
    if (existing) {
      log(existing.id, `orden repetida (Idempotency-Key=${key}) -> se devuelve la orden existente (idempotente)`);
      return { order: existing, replayed: true };
    }

    const order = this.orders.create({
      id: randomUUID(),
      productId: dto.productId,
      quantity: dto.quantity,
      amount: dto.amount,
      status: 'PENDING',
      failureReason: null,
      idempotencyKey: key,
    });
    try {
      await this.orders.save(order);
    } catch (err) {
      const winner = await this.orders.findOneBy({ idempotencyKey: key });
      if (winner) return { order: winner, replayed: true };
      throw err;
    }
    log(order.id, `orden creada: ${dto.productId} x${dto.quantity} por ${dto.amount} -> PENDING`);
    return { order, replayed: false };
  }

  /** Last saga step: the order becomes CONFIRMED. */
  async confirm(id: string): Promise<Order> {
    const order = await this.get(id);
    order.status = 'CONFIRMED';
    await this.orders.save(order);
    log(id, 'orden confirmada -> CONFIRMED');
    return order;
  }

  // compensation: marks the order as CANCELLED, instead of deleting it. Idempotent: if it was already CANCELLED, does nothing.
  async cancel(id: string, reason?: string): Promise<Order> {
    const order = await this.get(id);
    if (order.status === 'CANCELLED') {
      log(id, 'cancelación repetida -> ya estaba CANCELLED (idempotente)');
      return order;
    }
    if (order.status === 'CONFIRMED') {
      throw new ConflictException({ error: 'ORDER_ALREADY_CONFIRMED', message: 'No se puede cancelar una orden confirmada' });
    }
    order.status = 'CANCELLED';
    order.failureReason = reason ?? 'Cancelada';
    await this.orders.save(order);
    log(id, `orden cancelada (${order.failureReason}) -> CANCELLED`);
    return order;
  }
}
