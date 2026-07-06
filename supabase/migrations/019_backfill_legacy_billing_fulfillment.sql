-- Orders created before migration 015 were persisted only after Stripe checkout
-- completion and had their entitlements granted by the legacy webhook. Migration
-- 015 added fulfillment bookkeeping but did not backfill those existing rows.
-- New fulfillment is atomic, so a committed row with a null fulfilled_at value
-- can only be legacy data from before that migration.
update public.billing_orders
set
  fulfilled_at = coalesce(purchased_at, created_at, now()),
  credits_granted = case
    when product_key = 'election_pass' then greatest(quantity, 1)
    when product_key = 'bundle_3' then 3 * greatest(quantity, 1)
    else credits_granted
  end
where fulfilled_at is null;
