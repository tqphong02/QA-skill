import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne } from 'typeorm';

export interface User {
  id: string;
  email: string;
  orders: Order[];
}

@Entity()
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  code: string;

  @Column({ default: 'DRAFT' })
  status: string;

  @Column('decimal', { precision: 10, scale: 2 })
  amount: number;

  @ManyToOne('User', (user: User) => user.orders)
  user: User;

  @CreateDateColumn()
  createdAt: Date;
}
