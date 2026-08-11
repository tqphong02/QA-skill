int processPayment(bool userExists, int amount, String status) {
  if (!userExists) {
    throw ArgumentError("USER_NOT_FOUND");
  }
  if (amount <= 0) {
    throw ArgumentError("INVALID_AMOUNT");
  }
  switch (status) {
    case "SUCCESS":
      return 1;
    case "FAILED":
      throw StateError("PAYMENT_FAILED");
    default:
      try {
        return createPayment();
      } catch (error) {
        throw StateError("GATEWAY_ERROR");
      }
  }
}

int createPayment() {
  return 2;
}
