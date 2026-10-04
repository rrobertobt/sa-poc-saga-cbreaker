import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('products')
export class Product {
  @PrimaryColumn()
  sku: string;

  @Column()
  name: string;

  @Column('integer')
  stock: number;
}
