class Admin::RefundsController < Admin::BaseController
  def index
    @report = Report.new
  end
end
