-- Purchase records are needed for refund disputes, duplicate-fulfillment
-- forensics, and reconciliation after an account is deleted. Detach them from
-- the deleted user instead of cascading away.

alter table public.billing_orders
  alter column user_id drop not null;

alter table public.billing_orders
  drop constraint if exists billing_orders_user_id_fkey;

alter table public.billing_orders
  add constraint billing_orders_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete set null;

alter table public.app_store_transactions
  alter column user_id drop not null;

alter table public.app_store_transactions
  drop constraint if exists app_store_transactions_user_id_fkey;

alter table public.app_store_transactions
  add constraint app_store_transactions_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete set null;
