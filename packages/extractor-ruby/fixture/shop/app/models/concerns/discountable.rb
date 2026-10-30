module Discountable
  extend ActiveSupport::Concern

  included do
    has_many :coupons
  end

  def discount
    coupons.sum(&:amount)
  end
end
