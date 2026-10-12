package invoice

import "fmt"

func Issue[T ~int](total T) string {
	return fmt.Sprintf("invoice for %d", total)
}
