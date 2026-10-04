import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databasePath } from './common/database';
import { FaultsModule } from './common/faults';
import { HealthController } from './common/health.controller';
import { InventoryController } from './inventory/inventory.controller';
import { InventoryService } from './inventory/inventory.service';
import { Product } from './inventory/product.entity';
import { Reservation } from './inventory/reservation.entity';
import { StockAdminController } from './inventory/stock-admin.controller';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: databasePath('inventory.sqlite'),
      entities: [Product, Reservation],
      synchronize: true,
    }),
    TypeOrmModule.forFeature([Product, Reservation]),
    FaultsModule,
  ],
  controllers: [HealthController, InventoryController, StockAdminController],
  providers: [InventoryService],
})
export class AppModule {}
