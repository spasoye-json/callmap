class ReceiptJob < ApplicationJob
  def perform(order_id)
    order = ::Order.find(order_id)
    Shipping::Label.new(order).print
  end
end
