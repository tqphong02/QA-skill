package fixtures

func processPayment(userExists bool, amount int, status string) int {
	if !userExists {
		return -1
	}
	if amount <= 0 {
		return -2
	}
	switch status {
	case "SUCCESS":
		return 1
	case "FAILED":
		return -3
	default:
		return createPayment()
	}
}

func createPayment() int {
	return 2
}
