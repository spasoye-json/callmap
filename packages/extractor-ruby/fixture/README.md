# The Ruby fixture repo

A repo of two Rails apps the extractor reads, not code this repo ships. Every file is here to make
one rule of the extraction observable, so a reader can tell from the tree what the tests are
asserting.

| File                                                | What it holds for the extraction                                                       |
| --------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `shop/config/application.rb`                        | The file that makes `shop/` a Rails app; it lies outside the autoload roots            |
| `billing/config/application.rb`                     | The same for `billing/`, a second app with a loader of its own                         |
| `shop/app/models/order.rb`                          | A superclass, a concern, and a constant named in a method body                         |
| `shop/app/models/line_item.rb`                      | A superclass and nothing else                                                          |
| `shop/app/models/application_record.rb`             | A superclass from a gem, which no file of the app defines                              |
| `shop/app/models/report.rb`                         | The top-level `Report`                                                                 |
| `shop/app/models/admin/report.rb`                   | `Admin::Report`, the name a nested reference to `Report` finds first                   |
| `shop/app/models/concerns/discountable.rb`          | A concern, named `Discountable` because its directory is a root of its own             |
| `shop/app/controllers/admin/base_controller.rb`     | A nested superclass that resolves to the top-level `ApplicationController`             |
| `shop/app/controllers/admin/orders_controller.rb`   | Names resolved through the nesting, and `Invoice`, which only the billing app defines  |
| `shop/app/controllers/admin/refunds_controller.rb`  | A compact class name, which does not search `Admin` for `Report`                       |
| `shop/app/jobs/receipt_job.rb`                      | An absolute `::Order` and a path `Shipping::Label` through a namespace with no file    |
| `shop/app/services/shipping/label.rb`               | A file a directory names `Shipping::Label`                                             |
| `shop/lib/reconcile.rb`                             | Code inside an app but outside its autoload roots, which gets no edge                  |
| `billing/app/controllers/invoices_controller.rb`    | `Order`, which resolves to the billing app's own `Order` and not to the shop's         |
| `billing/app/models/order.rb`                       | A name both apps define                                                                |
| `billing/app/models/invoice.rb`                     | `Invoice`, which only the billing app defines, so the shop names it and gets no edge |
| `tools/release.rb`                                  | Code outside every app, which gets no edge                                             |

Nothing here is linted or type-checked, because it is held exactly as an extractor must find it.
