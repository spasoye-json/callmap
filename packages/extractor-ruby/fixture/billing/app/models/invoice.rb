class Invoice
  def self.for(order)
    new(order)
  end

  def coupons
    []
  end
end
