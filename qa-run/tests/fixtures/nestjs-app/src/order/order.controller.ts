import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards, SetMetadata } from '@nestjs/common';
import { OrderService, CreateOrderDto } from './order.service';

export const Roles = (...roles: string[]) => SetMetadata('roles', roles);
export class JwtAuthGuard {}

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Get()
  @Roles('admin', 'manager')
  findAll() {
    return this.orderService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.orderService.findOne(id);
  }

  @Post()
  create(@Body() createOrderDto: CreateOrderDto) {
    return this.orderService.create(createOrderDto);
  }

  @Put(':id/approve')
  @Roles('admin', 'manager')
  approve(@Param('id') id: string) {
    return this.orderService.approve(id);
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Param('id') id: string) {
    return this.orderService.remove(id);
  }
}
