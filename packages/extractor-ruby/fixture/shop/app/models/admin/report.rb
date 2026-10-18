module Admin
  class Report
    def rows
      Order.where(flagged: true)
    end
  end
end
