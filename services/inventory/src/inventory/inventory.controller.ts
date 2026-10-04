import { Body, Controller, Get, HttpCode, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { NoFaults } from '../common/faults';
import { IdempotencyKey } from '../common/idempotency-key.decorator';
import { ReleaseDto, ReserveDto } from './inventory.dto';
import { InventoryService } from './inventory.service';
import { Product } from './product.entity';
import { Reservation } from './reservation.entity';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @NoFaults()
  @Get('products')
  listProducts(): Promise<Product[]> {
    return this.inventory.listProducts();
  }

  @NoFaults()
  @Get('products/:sku')
  getProduct(@Param('sku') sku: string): Promise<Product> {
    return this.inventory.getProduct(sku);
  }

  @NoFaults()
  @Get('reservations')
  listReservations(): Promise<Reservation[]> {
    return this.inventory.listReservations();
  }

  @Post('reserve')
  async reserve(
    @IdempotencyKey() key: string,
    @Body() dto: ReserveDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Reservation> {
    const { reservation, replayed } = await this.inventory.reserve(key, dto);
    if (replayed) res.status(200).setHeader('Idempotent-Replayed', 'true');
    return reservation;
  }

  @Post('release')
  @HttpCode(200)
  release(@Body() dto: ReleaseDto, @IdempotencyKey(false) key?: string): Promise<Reservation> {
    return this.inventory.release(dto, key);
  }
}
