require "net/http"

class BillingClient
  def invoice(order)
    Net::HTTP.post(URI("http://billing.internal/invoices"), { order_id: order.id }.to_json)
  end
end
