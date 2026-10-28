class AddBillingToOrganizations < ActiveRecord::Migration[8.1]
  def change
    change_table :organizations, bulk: true do |t|
      t.string :plan, null: false, default: "free"
      t.string :plan_status
      t.string :stripe_customer_id
      t.string :stripe_subscription_id
      t.datetime :current_period_end
      t.index :stripe_customer_id, unique: true
      t.index :stripe_subscription_id, unique: true
    end
  end
end
