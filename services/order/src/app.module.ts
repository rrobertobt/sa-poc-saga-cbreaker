import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BreakersController } from './breakers/breakers.controller';
import { BreakersService } from './breakers/breakers.service';
import { DownstreamClient } from './clients/downstream.client';
import { databasePath } from './common/database';
import { HealthController } from './common/health.controller';
import { EventsController } from './events/events.controller';
import { EventsService } from './events/events.service';
import { Order } from './orders/order.entity';
import { OrdersController } from './orders/orders.controller';
import { OrdersService } from './orders/orders.service';
import { PurchaseSaga } from './saga/purchase.saga';
import { PurchaseService } from './saga/purchase.service';
import { SagaExecution } from './saga/saga-execution.entity';
import { SagaOrchestrator } from './saga/saga-orchestrator.service';
import { SagasController } from './saga/sagas.controller';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: databasePath('order.sqlite'),
      entities: [Order, SagaExecution],
      synchronize: true,
    }),
    TypeOrmModule.forFeature([Order, SagaExecution]),
    HttpModule,
  ],
  controllers: [HealthController, OrdersController, SagasController, BreakersController, EventsController],
  providers: [
    OrdersService,
    DownstreamClient,
    EventsService,
    BreakersService,
    SagaOrchestrator,
    PurchaseSaga,
    PurchaseService,
  ],
})
export class AppModule {}
