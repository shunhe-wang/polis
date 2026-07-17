-- Orders created before migration 015 were persisted only after Stripe checkout
-- completion and had their entitlements granted by the legacy webhook. Migration
-- 015 added fulfillment bookkeeping but did not backfill those existing rows.
-- New fulfillment is atomic, so a committed row with a null fulfilled_at value
-- can only be legacy data from before that migration.
--
-- credits_granted mirrors the live fulfill_billing_checkout semantics exactly:
-- it is populated for election_pass orders only (bundle_3 credit totals are
-- derived from product_key and quantity where needed).
--
-- The legacy webhook granted entitlements regardless of payment status, so
-- every legacy row is factually fulfilled; rows whose recorded status is not a
-- settled payment are flagged for manual review instead of being left to look
-- like fulfillment failures.
update public.billing_orders
set
  fulfilled_at = coalesce(purchased_at, created_at, now()),
  credits_granted = case
    when product_key = 'election_pass' then greatest(quantity, 1)
    else credits_granted
  end,
  metadata = case
    when status in ('paid', 'completed', 'no_payment_required') then metadata
    else metadata || '{"legacy_backfill_needs_review": true}'::jsonb
  end
where fulfilled_at is null;
