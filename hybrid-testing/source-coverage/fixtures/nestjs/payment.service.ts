import { Injectable } from "@nestjs/common";
import { PaymentRepository } from "./payment.repository";

@Injectable()
export class PaymentService {
  constructor(private readonly paymentRepository: PaymentRepository) {}

  processPayment(amount: number): number {
    if (amount <= 0) {
      throw new Error("INVALID_AMOUNT");
    }
    return this.paymentRepository.save(amount);
  }
}
