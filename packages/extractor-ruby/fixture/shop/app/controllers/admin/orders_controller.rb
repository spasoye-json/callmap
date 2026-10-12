module Admin
  class OrdersController < BaseController
    def index
      @orders = Order.all
      @report = Report.new
    end

    def show
      @invoice = Invoice.find_by(order_id: params[:id])
    end
  end
end
