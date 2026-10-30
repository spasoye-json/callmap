class Report
  def rows
    Order.recent
  end

  def render
    rows.map(&:to_s)
  end
end
