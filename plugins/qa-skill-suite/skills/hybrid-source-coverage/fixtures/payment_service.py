def process_payment(user, amount, status):
    if user is None:
        raise ValueError("USER_NOT_FOUND")
    if amount <= 0:
        raise ValueError("INVALID_AMOUNT")
    match status:
        case "SUCCESS":
            return {"status": "SUCCESS"}
        case "FAILED":
            raise ValueError("PAYMENT_FAILED")
        case _:
            try:
                return create_payment()
            except RuntimeError:
                raise ValueError("GATEWAY_ERROR")


def create_payment():
    return {"status": "NEW"}
