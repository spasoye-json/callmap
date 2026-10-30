module Pricing
  def self.quote(amount)
    amount * Tax.rate
  end

  def self.recent
    Order.recent
  end
end
