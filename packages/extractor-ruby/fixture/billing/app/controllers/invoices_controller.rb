class InvoicesController < ActionController::API
  def create
    order = Order.from_payload(params)
    render json: Invoice.for(order)
  end
end
