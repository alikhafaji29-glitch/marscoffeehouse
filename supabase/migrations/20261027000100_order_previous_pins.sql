-- A delivery order that came without a map pin can take the pin of the same customer's earlier order (owner,
-- 2026-10-27: "orders with no pin, give the option to add old pins, for sure that's after they make sure it's the same
-- location for this order"). Staff confirm with the customer first (the dashboard asks); the database only ever copies
-- a pin between orders of the same customer (the phone's last 9 digits) at the same branch, for staff of that branch.
alter table public.orders add column if not exists location_from text; -- the order the pin was taken from, e.g. 'M402918'

-- the same customer's earlier pins at this order's branch, newest first (5 at most)
create or replace function public.order_previous_pins(p_uid uuid)
returns table (code text, created_at timestamptz, address text, location jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare o public.orders;
declare ph text;
begin
  select * into o from public.orders where uid = p_uid;
  if o.uid is null or not private.is_staff(o.branch) then return; end if;
  ph := right(regexp_replace(coalesce(o.delivery_phone, o.customer_phone, ''), '\D', '', 'g'), 9);
  if length(ph) < 9 then return; end if;
  return query
    select p.code, p.created_at, p.address, p.location::jsonb from public.orders p
    where p.branch = o.branch and p.uid <> o.uid and p.location is not null
      and right(regexp_replace(coalesce(p.delivery_phone, p.customer_phone, ''), '\D', '', 'g'), 9) = ph
    order by p.created_at desc limit 5;
end;
$$;
revoke all on function public.order_previous_pins(uuid) from public, anon;
grant execute on function public.order_previous_pins(uuid) to authenticated;

-- put one of those pins on the order (only a delivery order, only one of the same customer's, same branch)
create or replace function public.order_use_pin(p_uid uuid, p_from text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare o public.orders;
declare src public.orders;
declare ph text;
begin
  select * into o from public.orders where uid = p_uid;
  if o.uid is null or not private.is_staff(o.branch) then raise exception 'not allowed' using errcode = '42501'; end if;
  if o.fulfil <> 'delivery' then raise exception 'not a delivery order' using errcode = 'P0001'; end if;
  ph := right(regexp_replace(coalesce(o.delivery_phone, o.customer_phone, ''), '\D', '', 'g'), 9);
  select * into src from public.orders p
    where p.code = p_from and p.branch = o.branch and p.uid <> o.uid and p.location is not null
      and right(regexp_replace(coalesce(p.delivery_phone, p.customer_phone, ''), '\D', '', 'g'), 9) = ph
    limit 1;
  if src.uid is null or length(ph) < 9 then raise exception 'no such pin for this customer' using errcode = 'P0001'; end if;
  update public.orders set location = src.location, location_from = src.code where uid = o.uid;
  return to_jsonb(src.location);
end;
$$;
revoke all on function public.order_use_pin(uuid, text) from public, anon;
grant execute on function public.order_use_pin(uuid, text) to authenticated;
