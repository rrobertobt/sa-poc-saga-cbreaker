import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export type ReservationStatus = 'RESERVED' | 'RELEASED';

@Entity('reservations')
export class Reservation {
  @PrimaryColumn()
  id: string;

  @Column()
  orderId: string;

  @Column()
  productId: string;

  @Column('integer')
  quantity: number;

  @Column({ type: 'varchar' })
  status: ReservationStatus;

  @Column({ unique: true })
  idempotencyKey: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
