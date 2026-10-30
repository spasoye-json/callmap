class Checkout
  def run
    Order.open_orders
  end

  def receipt
    run
  end
end
