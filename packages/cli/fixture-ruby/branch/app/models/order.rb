class Order
  def self.open_orders
    all_orders
  end

  def total
    subtotal + tax
  end

  def subtotal
    1
  end

  def tax
    0
  end
end
