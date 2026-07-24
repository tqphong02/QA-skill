import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Order } from './order.entity';

export enum OrderStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export interface CreateOrderDto {
  code: string;
  amount: number;
}

@Injectable()
export class OrderService {
  private repo: any;
  private eventEmitter: any;
  private mailService: any;

  async findAll() {
    return this.repo.find();
  }

  async findOne(id: string) {
    const order = await this.repo.findOne(id);
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async approve(id: string, user?: any) {
    const order = await this.findOne(id);
    if (order.status !== OrderStatus.PENDING) {
      throw new Error('Cannot approve order not in PENDING status');
    }
    if (user && !user.hasPermission('order:approve')) {
      throw new ForbiddenException('Insufficient permission to approve order');
    }
    order.status = OrderStatus.APPROVED;
    await this.repo.save(order);
    await this.eventEmitter.emit('order.approved', order);
    await this.mailService.sendMail({ to: order.user.email, subject: 'Order approved' });
  }

  async remove(id: string) {
    const order = await this.findOne(id);
    if (order.status === OrderStatus.COMPLETED) {
      throw new ConflictException('Cannot delete completed order');
    }
    await this.repo.delete(id);
  }

  async create(dto: CreateOrderDto) {
    const existing = await this.repo.findOne({ code: dto.code });
    if (existing) throw new ConflictException('Order code already exists');
    return this.repo.save({ ...dto, status: OrderStatus.DRAFT });
  }
}
