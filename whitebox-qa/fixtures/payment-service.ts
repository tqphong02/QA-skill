export interface User {
  id: string;
}

export interface Payment {
  status: "NEW" | "SUCCESS";
}

export class PaymentService {
  async processPayment(
    user: User | undefined,
    amount: number,
    status: "NEW" | "SUCCESS" | "FAILED",
  ): Promise<Payment> {
    if (!user) {
      throw new Error("USER_NOT_FOUND");
    }

    if (amount <= 0) {
      throw new Error("INVALID_AMOUNT");
    }

    if (status === "SUCCESS") {
      return { status: "SUCCESS" };
    }

    switch (status) {
      case "FAILED":
        throw new Error("PAYMENT_FAILED");
      case "NEW":
        break;
      default:
        throw new Error("INVALID_STATUS");
    }

    try {
      return await this.createPayment();
    } catch (error) {
      throw new Error("GATEWAY_ERROR");
    }
  }

  private async createPayment(): Promise<Payment> {
    return { status: "NEW" };
  }
}

export const processPayment = async (amount: number): Promise<number> => {
  if (amount <= 0) return 0;
  return amount;
};

export const identity = (value: number): number => value;
