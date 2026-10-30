# The Ruby fixture repo

A repo of 2 Rails apps and a gem the extractor reads, not code this repo ships. Every file is
here to make one rule of the extraction observable, so a reader can tell from the tree what the
tests assert.

| File                                               | What it holds for the extraction                                                                                                                     |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shop/config/application.rb`                       | The file that makes `shop/` a Rails app                                                                                                              |
| `billing/config/application.rb`                    | The same for `billing/`, a second app with a loader of its own                                                                                       |
| `shop/app/models/order.rb`                         | `def self.x`, `class << self`, calls on `self` and with no receiver, a call in a block, and `Order.from_payload`, which the billing app also defines |
| `shop/app/models/line_item.rb`                     | A class with no `def`, whose library methods a call on its constant reaches                                                                          |
| `shop/app/models/application_record.rb`            | A superclass from a gem, which no file of the app defines                                                                                            |
| `shop/app/models/report.rb`                        | A call on a constant that ties to a singleton method of `Order`, and `render`, a name a controller reaches only through Rails                        |
| `shop/app/models/admin/report.rb`                  | `Admin::Report`, the name a nested reference to `Report` finds first                                                                                 |
| `shop/app/models/concerns/discountable.rb`         | A concern, whose `discount` a call in `Order` reaches only through the class chain, and `has_many :coupons`                                          |
| `shop/app/controllers/admin/base_controller.rb`    | A nested superclass that resolves to the top-level `ApplicationController`                                                                           |
| `shop/app/controllers/application_controller.rb`   | `ApplicationController#authorize`, which a call reaches through 2 superclasses                                                                       |
| `shop/app/controllers/admin/orders_controller.rb`  | Names resolved through the nesting, `render` through `ActionController::Base`, and `Invoice`, which only the billing app defines                     |
| `shop/app/controllers/admin/refunds_controller.rb` | A compact class name, which does not search `Admin` for `Report`                                                                                     |
| `shop/app/jobs/application_job.rb`                 | `ApplicationJob#perform`, which `super` reaches                                                                                                      |
| `shop/app/jobs/receipt_job.rb`                     | `Shipping::Label.new`, which ties to `initialize`, a call on its result, and `super`                                                                 |
| `shop/app/jobs/refund_job.rb`                      | `super`, which a module of a gem reaches before `ApplicationJob#perform`                                                                             |
| `shop/app/services/shipping/label.rb`              | `Shipping::Label#initialize`, a method of a nested class                                                                                             |
| `shop/lib/reconcile.rb`                            | Code inside an app but outside its autoload roots                                                                                                    |
| `shop/config/initializers/slug.rb`                 | `String#slugify`, a method that the app adds to a class of Ruby                                                                                      |
| `shop/lib/core_ext/string.rb`                      | A second body of `String`, whose method `slugify` calls                                                                                              |
| `billing/app/controllers/invoices_controller.rb`   | `Order`, which resolves to the billing app's own `Order` and not to the shop's                                                                       |
| `billing/app/models/order.rb`                      | A name both apps define                                                                                                                              |
| `billing/app/models/invoice.rb`                    | `Invoice`, which only the billing app defines, and `coupons`, a name that `has_many` makes in the shop                                               |
| `gems/pricing/pricing.gemspec`                     | The file that makes `gems/pricing/` a load unit of its own                                                                                           |
| `gems/pricing/lib/pricing.rb`                      | A constant of the gem, and `Order`, which the gem does not define                                                                                    |
| `gems/pricing/lib/pricing/tax.rb`                  | `Pricing::Tax.rate`, which the gem ties through its own index                                                                                        |
| `tools/release.rb`                                 | Code outside every app, and a call outside any `def`, which draws nothing                                                                            |

Nothing here is linted or type-checked, because it is held exactly as an extractor must find it.
