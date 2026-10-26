package money

import "fmt"

func Format(cents int) string {
	return fmt.Sprintf("%d EUR", whole(cents))
}

func whole(cents int) int {
	return cents / 100
}
