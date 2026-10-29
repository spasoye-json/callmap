package checkout

import "example.com/shop/money"

func Total(prices []int) string {
	sum := 0
	for _, price := range prices {
		sum += price
	}
	return money.Format(money.Round(sum))
}

func Receipt(prices []int) string {
	return "Total: " + Total(prices)
}
