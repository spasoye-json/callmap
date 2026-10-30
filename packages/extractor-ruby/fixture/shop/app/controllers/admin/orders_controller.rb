module Admin
  class OrdersController < BaseController
    def index
      authorize
      @orders = Order.all
      @report = Report.new
    end

    def show
      @invoice = Invoice.for(params[:id])
      render json: @invoice
    end
  end
end
