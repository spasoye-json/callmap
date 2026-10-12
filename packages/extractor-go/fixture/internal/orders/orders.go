package orders

import "example.com/shop/internal/money"

type Order struct {
	Total money.Cents
}

func Place(total int) Order {
	return Order{Total: money.Cents(total)}
}
