package money

import "fmt"

func Format(cents int) string {
	return fmt.Sprintf("%d.%02d EUR", whole(cents), cents%100)
}

func Round(cents int) int {
	return whole(cents+50) * 100
}

func whole(cents int) int {
	return cents / 100
}
