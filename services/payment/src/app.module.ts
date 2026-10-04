import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databasePath } from './common/database';
import { FaultsModule } from './common/faults';
import { HealthController } from './common/health.controller';
import { Payment } from './payments/payment.entity';
import { PaymentsController } from './payments/payments.controller';
import { PaymentsService } from './payments/payments.service';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: databasePath('payment.sqlite'),
      entities: [Payment],
      synchronize: true,
    }),
    TypeOrmModule.forFeature([Payment]),
    FaultsModule,
  ],
  controllers: [HealthController, PaymentsController],
  providers: [PaymentsService],
})
export class AppModule {}
