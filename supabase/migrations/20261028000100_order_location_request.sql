-- Location request on WhatsApp (owner, 2026-10-26: "some customers order without pinning their location, make templates
-- to request location through whatsapp, and when the customer shares it, it will be added on his order card"; template
-- mars_location_request approved 2026-10-28; HANDOFF decision 223).
--   lang  the language the customer ordered in (the site's language at the time): the request goes out in it
--   wa    the WhatsApp side of the order, written only by the edge functions (service role):
--         { asked_at, asked_by, reminded, closed_replied, replies: [{ kind, text?, at }] }
--         asked_at: when staff sent the request; reminded: the "this chat only accepts your location" reply went out
--         (once per order); closed_replied: the "this order is already closed" reply went out (once per order);
--         replies: what the customer sent that was not a location (text, voice, photo…), newest last, at most 20
-- A location that arrives is written into orders.location with location_from = 'wa'.
alter table public.orders add column if not exists lang text check (lang in ('en', 'ar', 'ku'));
alter table public.orders add column if not exists wa jsonb;

-- staff may move and edit their branch's orders, but the WhatsApp record is the functions' alone
create or replace function public.orders_wa_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.wa := null;
    elsif new.wa is distinct from old.wa then
      new.wa := old.wa;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.orders_wa_guard() from public, anon, authenticated;

drop trigger if exists orders_wa_guard on public.orders;
create trigger orders_wa_guard
  before insert or update on public.orders
  for each row execute function public.orders_wa_guard();

-- customers write only listed columns of a new order (20261013000000_orders.sql): the language is one of them
grant insert (lang) on public.orders to authenticated;
