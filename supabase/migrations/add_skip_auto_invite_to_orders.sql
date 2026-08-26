-- Consolidated customer-email project: the payment webhook now provisions the portal account
-- itself (synchronously) for Flow A/C orders so it can fold the account link into the same
-- combined email as payment confirmation + invoice, instead of a 3rd separate email arriving
-- from the async provision_customer_account() trigger. This flag tells that trigger to stand
-- down for those orders. Manually-created orders (no flag set) are unaffected — they keep
-- getting their own standalone async invite email exactly as before.
alter table public.orders
  add column if not exists skip_auto_invite boolean not null default false;
