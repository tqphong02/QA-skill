import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards, Roles } from '@nestjs/common';
import { OrderService } from './order.service';

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
