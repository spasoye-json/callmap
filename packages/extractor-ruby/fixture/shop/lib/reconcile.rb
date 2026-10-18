class Reconcile
  def run
    Order.find_each { |order| Report.new.rows }
  end
end
