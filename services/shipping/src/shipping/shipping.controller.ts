import { Body, Controller, Delete, Get, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { NoFaults } from '../common/faults';
import { IdempotencyKey } from '../common/idempotency-key.decorator';
import { ScheduleShipmentDto } from './schedule-shipment.dto';
import { Shipment } from './shipment.entity';
import { ShippingService } from './shipping.service';

@Controller('shipping')
export class ShippingController {
  constructor(private readonly shipping: ShippingService) {}

  @NoFaults()
  @Get()
  list(): Promise<Shipment[]> {
    return this.shipping.list();
  }

  @NoFaults()
  @Get(':id')
  get(@Param('id') id: string): Promise<Shipment> {
    return this.shipping.get(id);
  }

  @Post('schedule')
  async schedule(
    @IdempotencyKey() key: string,
    @Body() dto: ScheduleShipmentDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Shipment> {
    const { shipment, replayed } = await this.shipping.schedule(key, dto);
    if (replayed) res.status(200).setHeader('Idempotent-Replayed', 'true');
    return shipment;
  }

  @Delete(':id')
  cancel(@Param('id') id: string, @IdempotencyKey(false) key?: string): Promise<Shipment> {
    return this.shipping.cancel(id, key);
  }
}
