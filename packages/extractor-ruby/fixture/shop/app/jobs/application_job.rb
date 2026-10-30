class ApplicationJob < ActiveJob::Base
  def perform(*args)
    args
  end
end
