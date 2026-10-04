import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { log } from '../common/logger';
import { ScheduleShipmentDto } from './schedule-shipment.dto';
import { Shipment } from './shipment.entity';

@Injectable()
export class ShippingService {
  constructor(@InjectRepository(Shipment) private readonly shipments: Repository<Shipment>) {}

  list(): Promise<Shipment[]> {
    return this.shipments.find({ order: { createdAt: 'DESC' } });
  }

  async get(id: string): Promise<Shipment> {
    const shipment = await this.shipments.findOneBy({ id });
    if (!shipment) throw new NotFoundException({ error: 'SHIPMENT_NOT_FOUND', message: `Envío ${id} no existe` });
    return shipment;
  }

  async schedule(key: string, dto: ScheduleShipmentDto): Promise<{ shipment: Shipment; replayed: boolean }> {
    const existing = await this.shipments.findOneBy({ idempotencyKey: key });
    if (existing) {
      log(key, `envío repetido -> devuelvo envío existente ${existing.id} (idempotente)`);
      return { shipment: existing, replayed: true };
    }

    const shipment = this.shipments.create({
      id: randomUUID(),
      orderId: dto.orderId,
      address: dto.address ?? 'Dirección de prueba 123',
      status: 'SCHEDULED',
      idempotencyKey: key,
    });
    try {
      await this.shipments.save(shipment);
    } catch (err) {
      const winner = await this.shipments.findOneBy({ idempotencyKey: key });
      if (winner) return { shipment: winner, replayed: true };
      throw err;
    }
    log(key, `envío ${shipment.id} programado para la orden ${dto.orderId} -> SCHEDULED`);
    return { shipment, replayed: false };
  }

  async cancel(id: string, key?: string): Promise<Shipment> {
    const shipment = await this.get(id);
    const sagaId = key ?? shipment.idempotencyKey;
    if (shipment.status === 'CANCELLED') {
      log(sagaId, `cancelación repetida del envío ${id} -> ya estaba CANCELLED (idempotente)`);
      return shipment;
    }
    shipment.status = 'CANCELLED';
    await this.shipments.save(shipment);
    log(sagaId, `envío ${id} cancelado -> CANCELLED`);
    return shipment;
  }
}
