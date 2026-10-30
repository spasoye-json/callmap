class Report
  def rows
    Order.recent
  end
end
