-- Up to 50 combos in one order (owner, 2026-10-22: "combo maximum number per order is 10, make it 50"): a combo is a
-- line per pick (a sandwich and a drink), so an order may hold up to 200 lines (was 40).
alter table public.orders drop constraint if exists orders_items_check;
alter table public.orders add constraint orders_items_check check (cardinality(items) >= 1 and cardinality(items) <= 200);
