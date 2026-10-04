import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { log } from '../common/logger';
import { ReleaseDto, ReserveDto } from './inventory.dto';
import { Product } from './product.entity';
import { Reservation } from './reservation.entity';

const SEED: Product[] = [
  { sku: 'P-001', name: 'Producto con stock', stock: 10 },
  { sku: 'P-002', name: 'Producto sin stock', stock: 0 },
];

@Injectable()
export class InventoryService implements OnModuleInit {
  constructor(
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(Reservation) private readonly reservations: Repository<Reservation>,
  ) {}

  async onModuleInit(): Promise<void> {
    for (const product of SEED) {
      if (!(await this.products.existsBy({ sku: product.sku }))) {
        await this.products.insert(product);
        log(null, `semilla: ${product.sku} stock=${product.stock}`);
      }
    }
  }

  /** Restores stock from the seed data (to repeat test scenarios). */
  async resetStock(): Promise<Product[]> {
    await this.products.save(SEED.map((product) => ({ ...product })));
    log(null, `stock restaurado: ${SEED.map((p) => `${p.sku}=${p.stock}`).join(', ')}`);
    return this.listProducts();
  }

  listProducts(): Promise<Product[]> {
    return this.products.find({ order: { sku: 'ASC' } });
  }

  async getProduct(sku: string): Promise<Product> {
    const product = await this.products.findOneBy({ sku });
    if (!product) throw new NotFoundException({ error: 'PRODUCT_NOT_FOUND', message: `Producto ${sku} no existe` });
    return product;
  }

  listReservations(): Promise<Reservation[]> {
    return this.reservations.find({ order: { createdAt: 'DESC' } });
  }

  async reserve(key: string, dto: ReserveDto): Promise<{ reservation: Reservation; replayed: boolean }> {
    const existing = await this.reservations.findOneBy({ idempotencyKey: key });
    if (existing) {
      log(key, `reserva repetida -> devuelvo reserva existente ${existing.id} (idempotente)`);
      return { reservation: existing, replayed: true };
    }

    await this.getProduct(dto.productId);
    // Atomic decrement: only applies if there's enough stock.
    const result = await this.products
      .createQueryBuilder()
      .update(Product)
      .set({ stock: () => 'stock - :quantity' })
      .where('sku = :sku AND stock >= :quantity', { sku: dto.productId, quantity: dto.quantity })
      .execute();
    if (!result.affected) {
      log(key, `sin stock para ${dto.productId} x${dto.quantity} -> 409 OUT_OF_STOCK`);
      throw new ConflictException({ error: 'OUT_OF_STOCK', message: `Stock insuficiente para ${dto.productId}` });
    }

    const reservation = this.reservations.create({
      id: randomUUID(),
      orderId: dto.orderId,
      productId: dto.productId,
      quantity: dto.quantity,
      status: 'RESERVED',
      idempotencyKey: key,
    });
    try {
      await this.reservations.save(reservation);
    } catch (err) {
      // Race with the same key: undo the decrement and return the winning reservation.
      await this.products.increment({ sku: dto.productId }, 'stock', dto.quantity);
      const winner = await this.reservations.findOneBy({ idempotencyKey: key });
      if (winner) return { reservation: winner, replayed: true };
      throw err;
    }
    log(key, `reserva ${reservation.id}: ${dto.productId} x${dto.quantity} para la orden ${dto.orderId} -> RESERVED`);
    return { reservation, replayed: false };
  }

  async release(dto: ReleaseDto, key?: string): Promise<Reservation> {
    if (!dto.reservationId && !dto.orderId) {
      throw new BadRequestException({ error: 'INVALID_RELEASE', message: 'Indica reservationId u orderId' });
    }
    const reservation = await this.reservations.findOneBy(
      dto.reservationId ? { id: dto.reservationId } : { orderId: dto.orderId },
    );
    if (!reservation) {
      throw new NotFoundException({ error: 'RESERVATION_NOT_FOUND', message: 'No existe la reserva indicada' });
    }
    const sagaId = key ?? reservation.idempotencyKey;

    // Conditional state change: only the first one to move from RESERVED to RELEASED returns the stock.
    const result = await this.reservations.update(
      { id: reservation.id, status: 'RESERVED' },
      { status: 'RELEASED' },
    );
    if (!result.affected) {
      log(sagaId, `liberación repetida de la reserva ${reservation.id} -> ya estaba RELEASED (idempotente)`);
      return reservation;
    }
    await this.products.increment({ sku: reservation.productId }, 'stock', reservation.quantity);
    log(sagaId, `reserva ${reservation.id} liberada: +${reservation.quantity} ${reservation.productId} -> RELEASED`);
    return (await this.reservations.findOneBy({ id: reservation.id }))!;
  }
}
