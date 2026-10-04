import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { SagaContext } from './saga.types';

export type SagaStatus = 'STARTED' | 'COMPENSATING' | 'COMPLETED' | 'COMPENSATED' | 'COMPENSATION_FAILED';

export interface SagaLogEntry {
  at: string;
  step: string;
  action: 'execute' | 'compensate';
  result: 'success' | 'failure' | 'retry';
  message: string;
  attempt?: number;
}

@Entity('saga_executions')
export class SagaExecution {
  /** Same as orderId: one saga per order. */
  @PrimaryColumn()
  id: string;

  @Column()
  orderId: string;

  @Column({ type: 'varchar' })
  status: SagaStatus;

  @Column('simple-json')
  context: SagaContext;

  @Column('simple-json')
  completedSteps: string[];

  @Column('simple-json')
  log: SagaLogEntry[];

  @Column({ type: 'varchar', nullable: true })
  failureReason: string | null;

  // With milliseconds, to correctly order orders created in the same second (bursts).
  @CreateDateColumn({ default: () => "STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')" })
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
