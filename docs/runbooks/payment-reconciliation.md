# Runbook: Payment and fulfillment reconciliation

## Purpose

Resolve mismatches between money collected and entitlements granted, across Stripe (web) and Apple StoreKit (iOS): user paid but has no credit, duplicate grants, and refunds.

## Severity classification

- SEV1: Systemic fulfillment failure, multiple users paying without receiving credits, or the Stripe webhook failing continuously.
- SEV2: A single user paid without entitlement, or a confirmed duplicate grant.
- SEV3: A refund to process, or a stale unfulfilled row with no user complaint.

## First five minutes

- [ ] Open `/admin` and read `unfulfilledOrders`, `unfulfilledAppStoreTransactions`, `paidOrders24h`, and `appStorePurchases24h`.
- [ ] TODO: alert delivery is being wired separately; the dashboard counters are the current detection surface.
- [ ] Check for fulfillment errors: `select * from app_event_logs where category = 'billing' and severity = 'error' order by created_at desc limit 50;` (Supabase SQL editor, owner access required).
  Key events: `webhook_failed` (Stripe) and `app_store_transaction_failed` (StoreKit).
- [ ] Check webhook delivery health in the Stripe dashboard under Developers, Webhooks (owner access required); Stripe retries failed deliveries automatically.
- [ ] If systemic, identify the failing dependency (Supabase down, bad deploy, missing `STRIPE_WEBHOOK_SECRET`) before touching individual accounts.

## Data model

- `billing_orders`: one row per Stripe checkout, unique on `stripe_checkout_session_id`, with `fulfilled_at` and `credits_granted` (migrations 008, 015, backfilled by 019).
- `app_store_transactions`: one row per Apple transaction, primary key `transaction_id`, with `fulfilled_at` and `credits_granted` (migrations 020, 021).
- `account_entitlements`: the credit balance per user (`election_pass_credits`); clients cannot write it (migration 017), only security-definer functions can.
- `guide_access_grants`: one row per unlocked ballot (`user_id`, `ballot_hash`, `access_source`), written when a credit is spent by `consume_guide_access` (migrations 008, 015, 016).
- Fulfillment functions: `fulfill_billing_checkout` (Stripe, migration 015) and `fulfill_app_store_transaction` (Apple, migrations 020 and 021); both are idempotent and report `already_fulfilled` on replay, and both call `grant_billing_entitlement` internally.
- Entry points: `/api/stripe/webhook` (`src/app/api/stripe/webhook/route.ts`) and `/api/storekit/transactions` (`src/app/api/storekit/transactions/route.ts`); shared config in `src/lib/billing.ts` and transaction normalization in `src/lib/app-store.ts`.

## Case 1: user paid, no entitlement

### Stripe

- [ ] Find the payment in the Stripe dashboard and copy the checkout session id (owner access required).
- [ ] Check for the order row: `select * from billing_orders where stripe_checkout_session_id = '<cs_...>';`
- [ ] Row exists with `fulfilled_at` set: fulfillment worked; the user probably spent the credit.
  Check `select * from guide_access_grants where user_id = '<uuid>';` and `select * from account_entitlements where user_id = '<uuid>';` and explain the ledger to the user.
- [ ] Row missing: the webhook never completed.
  In the Stripe dashboard, resend the `checkout.session.completed` event to `/api/stripe/webhook` (owner access required); the handler is idempotent, so resending is safe.
- [ ] If the webhook cannot be replayed, grant manually in SQL: `select * from grant_billing_entitlement('<user uuid>', 'election_pass', 1, now());` and insert a matching `billing_orders` row with `fulfilled_at` set so the books balance.
- [ ] Verify: `election_pass_credits` incremented in `account_entitlements`, and an `app_event_logs` row with event `checkout_completed` exists for the resend path.

### StoreKit

- [ ] The iOS client posts the signed transaction to `/api/storekit/transactions`; the client can safely retry, so first ask the user to relaunch the app, which replays unfinished transactions.
- [ ] Check the row: `select * from app_store_transactions where user_id = '<uuid>' order by purchase_date desc;`
- [ ] Row exists, `fulfilled_at` null: run the fulfillment function manually with the row's own values: `select * from fulfill_app_store_transaction(user_id, transaction_id, original_transaction_id, app_account_token, product_id, product_key, environment, purchase_date, quantity) from app_store_transactions where transaction_id = '<id>';`
  Migration 021 makes this strictly idempotent; replaying a fulfilled transaction returns `already_fulfilled = true` and grants nothing.
- [ ] Row missing: verify the purchase in App Store Connect (owner access required), confirm the `appAccountToken` matches the user's id (the check in `src/lib/app-store.ts` rejects mismatched accounts), then have the user retry from the device.
- [ ] Common rejection causes from `normalizeAppStoreTransaction`: wrong `APP_STORE_PRODUCT_ELECTION_PASS`, wrong `APPLE_IAP_ENVIRONMENT`, revoked transaction, or an `appAccountToken` from a different signed-in account.

## Case 2: duplicate grant

- [ ] Both fulfillment functions are idempotent per checkout session and per `transaction_id`, and log `checkout_completed_duplicate` or `app_store_transaction_duplicate` events on replay.
  A true duplicate therefore means two distinct payment records for one intended purchase, or a manual grant on top of an automatic one.
- [ ] Audit the ledger for the user: sum `credits_granted` from `billing_orders` plus `app_store_transactions`, subtract rows in `guide_access_grants` with `access_source = 'election_pass'`, and compare with `account_entitlements.election_pass_credits`.
- [ ] If the user was double charged, refund the extra charge (Case 3) rather than clawing back credits.
- [ ] If credits were granted without payment, decrement manually: `update account_entitlements set election_pass_credits = election_pass_credits - 1, updated_at = now() where user_id = '<uuid>' and election_pass_credits > 0;`
- [ ] Record what you did in an `app_event_logs` insert (category `billing`, event `manual_adjustment`) so `/admin` history reflects it.

## Case 3: refunds

- [ ] Stripe: issue the refund in the Stripe dashboard (owner access required).
  The webhook handles `charge.refunded` by calling `revoke_billing_order`, which stamps `revoked_at` on the order and decrements unspent credits (floored at zero); the event `billing_order_refunded` appears in `/admin` and the alert webhook.
- [ ] Apple: refunds are granted by Apple, not by us.
  The App Store Server Notifications V2 endpoint at `/api/storekit/notifications` handles `REFUND` and `REVOKE` by calling `revoke_app_store_transaction`; configure the notification URL in App Store Connect (owner access required).
- [ ] Verify the automatic clawback landed: check `revoked_at` on the order or transaction row and the `Refunds/Revocations (24h)` counter on `/admin`.
- [ ] If the credit was already spent, the decrement floors at zero by design; no further action unless abuse is suspected.
  If the credit was already spent on a guide, decide policy: revoke the `guide_access_grants` row, or let it stand and note the loss.
- [ ] Update the `billing_orders.status` field for refunded Stripe orders so the `/admin` revenue counters stay honest.

## Recovery verification

- [ ] `/admin` shows `unfulfilledOrders` and `unfulfilledAppStoreTransactions` at or trending to zero.
- [ ] The affected user confirms the expected `election_pass_credits` balance on their account page.
- [ ] Spot-check the invariant across users: total `credits_granted` minus spent grants equals current balances.
- [ ] Write a postmortem note in `docs/runbooks/postmortems/` for anything systemic.
