class Order
  def self.open_orders
    all_orders
  end

  def total
    subtotal
  end

  def subtotal
    1
  end

  def legacy_total
    total
  end
end
