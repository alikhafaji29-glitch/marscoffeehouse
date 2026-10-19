-- Staff can cancel an order, with a reason the customer reads (owner, 2026-10-19: "add cancel order, and reason of
-- cancellation, to be added as a new card called cancelled").
-- `status` may now be 'cancelled' (the history trigger adds the line by itself), and `cancel_reason` holds why:
-- 'r:<code>' for a ready-made reason (customer, stock, unreachable, area, closed; the site translates it) or the
-- staff's own words. A cancelled order must have a reason. Staff of the branch may write it, like the status.
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('received', 'preparing', 'done', 'onway', 'delivered', 'cancelled'));
alter table public.orders add column if not exists cancel_reason text;
alter table public.orders drop constraint if exists orders_cancel_reason_check;
alter table public.orders add constraint orders_cancel_reason_check
  check ((cancel_reason is null or char_length(cancel_reason) <= 200)
         and (status <> 'cancelled' or (cancel_reason is not null and btrim(cancel_reason) <> '')));
grant update (cancel_reason) on public.orders to authenticated;
