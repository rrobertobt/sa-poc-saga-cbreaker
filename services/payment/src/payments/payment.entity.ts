import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export type PaymentStatus = 'CHARGED' | 'REFUNDED';

@Entity('payments')
export class Payment {
  @PrimaryColumn()
  id: string;

  @Column()
  orderId: string;

  @Column('real')
  amount: number;

  @Column({ type: 'varchar' })
  status: PaymentStatus;

  @Column({ unique: true })
  idempotencyKey: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
