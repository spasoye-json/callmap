class Order < ApplicationRecord
  include Discountable

  has_many :line_items

  def total
    LineItem.where(order: self).sum(&:amount) - discount
  end
end
