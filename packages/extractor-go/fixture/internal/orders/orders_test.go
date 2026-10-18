package orders

import (
	"testing"

	"example.com/shop/internal/money"
)

func TestPlace(t *testing.T) {
	if Place(5).Total != money.Cents(5) {
		t.Fatal("the total is lost")
	}
}
