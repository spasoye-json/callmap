class RefundJob < ApplicationJob
  include Sidekiq::Throttled::Job

  def perform(refund_id)
    super(refund_id)
  end
end
