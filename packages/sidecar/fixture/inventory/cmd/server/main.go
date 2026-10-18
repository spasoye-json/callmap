package main

import (
	"net/http"

	"example.com/inventory/internal/stock"
)

func main() {
	http.HandleFunc("/stock", stock.Handle)
	http.ListenAndServe(":8081", nil)
}
