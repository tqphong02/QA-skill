class PaymentService {
  int ProcessPayment(bool userExists, int amount, string status) {
    if (!userExists) {
      throw new System.ArgumentException("USER_NOT_FOUND");
    }
    if (amount <= 0) {
      throw new System.ArgumentException("INVALID_AMOUNT");
    }
    switch (status) {
      case "SUCCESS":
        return 1;
      case "FAILED":
        throw new System.InvalidOperationException("PAYMENT_FAILED");
      default:
        try {
          return CreatePayment();
        } catch (System.Exception error) {
          throw new System.InvalidOperationException("GATEWAY_ERROR");
        }
    }
  }

  int CreatePayment() {
    return 2;
  }
}
