class Checkout
  def run
    Order.open_orders
  end
end
