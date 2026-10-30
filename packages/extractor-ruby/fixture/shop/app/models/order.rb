class Order < ApplicationRecord
  include Discountable

  has_many :line_items

  def self.find_open
    where(open: true)
  end

  class << self
    def recent
      find_open.limit(10)
    end
  end

  def total
    line_items.each { |item| count(item) }
    subtotal - self.discount_of(subtotal)
  end

  def subtotal
    LineItem.where(order: self).sum(&:amount)
  end

  def discount_of(amount)
    discount * amount
  end

  def count(item)
    item.quantity
  end

  def self.from_payload(payload)
    new(payload)
  end
end
