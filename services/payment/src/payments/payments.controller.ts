import { Body, Controller, Get, HttpCode, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { NoFaults } from '../common/faults';
import { IdempotencyKey } from '../common/idempotency-key.decorator';
import { CreatePaymentDto } from './create-payment.dto';
import { Payment } from './payment.entity';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @NoFaults()
  @Get()
  list(): Promise<Payment[]> {
    return this.payments.list();
  }

  @NoFaults()
  @Get(':id')
  get(@Param('id') id: string): Promise<Payment> {
    return this.payments.get(id);
  }

  @Post()
  async charge(
    @IdempotencyKey() key: string,
    @Body() dto: CreatePaymentDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Payment> {
    const { payment, replayed } = await this.payments.charge(key, dto);
    if (replayed) res.status(200).setHeader('Idempotent-Replayed', 'true');
    return payment;
  }

  @Post(':id/refund')
  @HttpCode(200)
  refund(@Param('id') id: string, @IdempotencyKey(false) key?: string): Promise<Payment> {
    return this.payments.refund(id, key);
  }
}
