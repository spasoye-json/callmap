package main

import (
	"fmt"

	"example.com/billing/invoice"
	shoporders "example.com/shop/internal/orders"
)

func main() {
	order := shoporders.Place(1200)
	fmt.Println(invoice.Issue(order.Total), shoporders.Receipt(order))
}
