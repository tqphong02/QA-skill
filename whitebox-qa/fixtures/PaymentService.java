class PaymentService {
  int processPayment(boolean userExists, int amount, String status) {
    if (!userExists) {
      throw new IllegalArgumentException("USER_NOT_FOUND");
    }
    if (amount <= 0) {
      throw new IllegalArgumentException("INVALID_AMOUNT");
    }
    switch (status) {
      case "SUCCESS":
        return 1;
      case "FAILED":
        throw new IllegalStateException("PAYMENT_FAILED");
      default:
        try {
          return createPayment();
        } catch (RuntimeException error) {
          throw new IllegalStateException("GATEWAY_ERROR");
        }
    }
  }

  int createPayment() {
    return 2;
  }
}
