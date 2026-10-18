package orders

import "strconv"

func Receipt(order Order) string {
	return "receipt for " + strconv.Itoa(int(order.Total))
}
