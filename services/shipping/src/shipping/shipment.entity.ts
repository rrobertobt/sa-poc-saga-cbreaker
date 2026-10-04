import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export type ShipmentStatus = 'SCHEDULED' | 'CANCELLED';

@Entity('shipments')
export class Shipment {
  @PrimaryColumn()
  id: string;

  @Column()
  orderId: string;

  @Column()
  address: string;

  @Column({ type: 'varchar' })
  status: ShipmentStatus;

  @Column({ unique: true })
  idempotencyKey: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
