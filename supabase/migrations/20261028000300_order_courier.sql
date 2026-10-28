-- Which delivery company took an order (owner, 2026-10-28: "a report for the delivery companies to collect revenues from
-- them, and to give them their share"; HANDOFF decision 225). Set by the dashboard when staff send the order to a company
-- (the card's Zhin / wadi app buttons), or chosen by hand on the card; the Deliveries report groups by it.
alter table public.orders add column if not exists courier text check (char_length(courier) <= 40);
create index if not exists orders_branch_courier on public.orders (branch, created_at desc) where fulfil = 'delivery';

create or replace function public.order_set_courier(p_uid uuid, p_courier text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b text;
begin
  select branch into b from public.orders where uid = p_uid;
  if b is null or not private.is_staff(b) then raise exception 'not allowed' using errcode = '42501'; end if;
  update public.orders set courier = nullif(left(trim(coalesce(p_courier, '')), 40), '') where uid = p_uid;
end;
$$;
revoke all on function public.order_set_courier(uuid, text) from public, anon;
grant execute on function public.order_set_courier(uuid, text) to authenticated;
