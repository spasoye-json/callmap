# The mixed fixture repo

A repo with three languages side by side that the sidecar opens, not code this repo ships. A web
client in TypeScript calls a Rails app over HTTP, and a Go service sits beside them with no caller.
Every extractor claims only its own files, so the merge holds three language tags and no reference
edge between two of them.

| File                                             | What it holds                                                    |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| `web/src/screens/checkout.ts`                    | The entry point: line 4 calls the orders client                  |
| `web/src/api/orders-client.ts`                   | Line 2 sends `POST /orders`, the near end of the HTTP boundary   |
| `shop/config/application.rb`                     | The file that makes `shop/` a Rails app                          |
| `shop/config/routes.rb`                          | Line 2 routes `POST /orders` to `orders#create`, the evidence    |
| `shop/app/controllers/orders_controller.rb`      | Line 3 is the far end of the HTTP boundary, and it names `Order` |
| `shop/app/controllers/application_controller.rb` | The superclass of the orders controller                          |
| `shop/app/models/order.rb`                       | Line 3 writes the order row                                      |
| `shop/app/models/application_record.rb`          | The superclass of the order                                      |
| `inventory/cmd/server/main.go`                   | A Go service that imports its stock package                      |
| `inventory/internal/stock/stock.go`              | The stock package                                                |

The reference edges are `checkout.ts` to `orders-client.ts`, `orders_controller.rb` to
`application_controller.rb` and to `order.rb`, `order.rb` to `application_record.rb`, and `main.go`
to `stock.go`. The hop from `orders-client.ts` to `orders_controller.rb` is a boundary. A flow
draws it as an inferred `http` edge that quotes `shop/config/routes.rb` line 2.

Nothing here is linted or type-checked, because it is held exactly as an extractor must find it.
