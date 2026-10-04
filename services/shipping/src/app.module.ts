import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databasePath } from './common/database';
import { FaultsModule } from './common/faults';
import { HealthController } from './common/health.controller';
import { Shipment } from './shipping/shipment.entity';
import { ShippingController } from './shipping/shipping.controller';
import { ShippingService } from './shipping/shipping.service';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: databasePath('shipping.sqlite'),
      entities: [Shipment],
      synchronize: true,
    }),
    TypeOrmModule.forFeature([Shipment]),
    FaultsModule,
  ],
  controllers: [HealthController, ShippingController],
  providers: [ShippingService],
})
export class AppModule {}
