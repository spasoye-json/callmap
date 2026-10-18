module Shipping
  class Label
    def initialize(order)
      @order = order
    end

    def print
      @order.line_items.map(&:id)
    end
  end
end
