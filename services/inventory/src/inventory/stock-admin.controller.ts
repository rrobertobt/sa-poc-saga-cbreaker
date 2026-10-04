import { Controller, HttpCode, Post } from '@nestjs/common';
import { NoFaults } from '../common/faults';
import { InventoryService } from './inventory.service';
import { Product } from './product.entity';

@NoFaults()
@Controller('admin/stock')
export class StockAdminController {
  constructor(private readonly inventory: InventoryService) {}

  @Post('reset')
  @HttpCode(200)
  reset(): Promise<Product[]> {
    return this.inventory.resetStock();
  }
}
