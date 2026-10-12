class Order < ApplicationRecord
  def self.place(cart)
    create!(lines: cart)
  end
end
