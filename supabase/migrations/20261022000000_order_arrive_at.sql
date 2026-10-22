-- When a pickup customer says they will arrive (owner, 2026-10-22: "when client chooses pick up he must tell us his
-- time of arrival"), from the cart checkout and the Positive Hours order. Written by the customer with the order, read
-- by the staff. A Positive Hours pre-order keeps its chosen time in offer.wantAt instead.
alter table public.orders add column if not exists arrive_at timestamptz;
grant insert (arrive_at) on public.orders to authenticated;
