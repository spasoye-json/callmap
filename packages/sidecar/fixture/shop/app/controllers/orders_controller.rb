class OrdersController < ApplicationController
  def create
    order = Order.place(params.require(:cart))
    render json: { id: order.id }
  end
end
