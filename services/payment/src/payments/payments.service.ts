import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { log } from '../common/logger';
import { CreatePaymentDto } from './create-payment.dto';
import { Payment } from './payment.entity';

@Injectable()
export class PaymentsService {
  constructor(@InjectRepository(Payment) private readonly payments: Repository<Payment>) {}

  list(): Promise<Payment[]> {
    return this.payments.find({ order: { createdAt: 'DESC' } });
  }

  async get(id: string): Promise<Payment> {
    const payment = await this.payments.findOneBy({ id });
    if (!payment) throw new NotFoundException({ error: 'PAYMENT_NOT_FOUND', message: `Pago ${id} no existe` });
    return payment;
  }

  async charge(key: string, dto: CreatePaymentDto): Promise<{ payment: Payment; replayed: boolean }> {
    const existing = await this.payments.findOneBy({ idempotencyKey: key });
    if (existing) {
      log(key, `cobro repetido -> devuelvo pago existente ${existing.id} (idempotente)`);
      return { payment: existing, replayed: true };
    }

    const payment = this.payments.create({
      id: randomUUID(),
      orderId: dto.orderId,
      amount: dto.amount,
      status: 'CHARGED',
      idempotencyKey: key,
    });
    try {
      await this.payments.save(payment);
    } catch (err) {
      // Race between two requests with the same key: the first one wins.
      const winner = await this.payments.findOneBy({ idempotencyKey: key });
      if (winner) return { payment: winner, replayed: true };
      throw err;
    }
    log(key, `cobro de ${dto.amount} para la orden ${dto.orderId} -> pago ${payment.id} CHARGED`);
    return { payment, replayed: false };
  }

  async refund(id: string, key?: string): Promise<Payment> {
    const payment = await this.get(id);
    const sagaId = key ?? payment.idempotencyKey;
    if (payment.status === 'REFUNDED') {
      log(sagaId, `reembolso repetido del pago ${id} -> ya estaba REFUNDED (idempotente)`);
      return payment;
    }
    payment.status = 'REFUNDED';
    await this.payments.save(payment);
    log(sagaId, `reembolso del pago ${id} (${payment.amount}) -> REFUNDED`);
    return payment;
  }
}
