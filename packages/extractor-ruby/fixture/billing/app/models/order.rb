class Order
  def self.from_payload(payload)
    new(payload.fetch("order_id"))
  end
end
