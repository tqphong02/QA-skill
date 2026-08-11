import { Injectable } from "@nestjs/common";

@Injectable()
export class PaymentRepository {
  save(amount: number): number {
    return amount;
  }
}
