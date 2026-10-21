-- The customer's note for the café on an order ("less ice", "call when you arrive"), from the cart checkout and the
-- Positive Hours order (owner, 2026-10-21). Written by the customer with the order, read by the staff; 300 characters.
alter table public.orders add column if not exists note text;
alter table public.orders drop constraint if exists orders_note_check;
alter table public.orders add constraint orders_note_check check (note is null or char_length(note) <= 300);
grant insert (note) on public.orders to authenticated;
