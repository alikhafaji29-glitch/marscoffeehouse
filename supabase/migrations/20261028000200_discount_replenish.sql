-- Discounts and replenishments (owner, 2026-10-28; HANDOFF decision 224).
--
-- Discount: "some customers may have a discount when they order, so the barista can edit the discount, it may be a full
-- discount 100% or 50% or a fixed amount that he types, on active orders before sending". Any staff of the branch, on an
-- order still at Request received / Preparing / Done. orders.total becomes what the driver collects (so the receipt, the
-- driver's message, the customer's tracker and the analytics all follow); orders.discount keeps the price before it:
--   { kind: 'pct' | 'fixed', value, amount, before, by, at }      (kind 'none' removes it and puts `before` back)
--
-- Replenishment: "if something happens to the order, or the order arrived late, or any other reason, they resend the
-- order to the client as a replenishment gift for free"; any staff (baristas too); the staff choose items of the order
-- and may add items from the menu; no message to the customer, no automatic suggestion. A NEW order, free (total 0),
-- to the same customer / address / pin, starting at Request received like any order; orders.replenish on it:
--   { of_uid, of_code, reason: late | wrong | missing | damaged | quality | other, note, by, at }
-- A paused branch still takes it (staff send it, not a customer).
alter table public.orders add column if not exists discount jsonb;
alter table public.orders add column if not exists replenish jsonb;
create index if not exists orders_replenish_of on public.orders ((replenish->>'of_uid')) where replenish is not null;

create or replace function public.order_set_discount(p_uid uuid, p_kind text, p_value integer default 0)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
  base integer;
  amount integer;
begin
  select * into o from public.orders where uid = p_uid for update;
  if o.uid is null or not private.is_staff(o.branch) then raise exception 'not allowed' using errcode = '42501'; end if;
  if o.status not in ('received', 'preparing', 'done') then raise exception 'The order is already on its way or closed.' using errcode = 'P0011'; end if;
  base := coalesce((o.discount->>'before')::integer, o.total);
  if p_kind = 'none' then
    update public.orders set total = base, discount = null where uid = p_uid;
    return base;
  elsif p_kind = 'pct' and p_value between 1 and 100 then
    amount := round(base * p_value / 100.0);
  elsif p_kind = 'fixed' and p_value between 1 and base then
    amount := p_value;
  else
    raise exception 'Not a discount.' using errcode = '22023';
  end if;
  update public.orders
    set total = base - amount,
        discount = jsonb_build_object('kind', p_kind, 'value', p_value, 'amount', amount, 'before', base,
                                      'by', (select private.my_uuid()), 'at', now())
    where uid = p_uid;
  return base - amount;
end;
$$;
revoke all on function public.order_set_discount(uuid, text, integer) from public, anon;
grant execute on function public.order_set_discount(uuid, text, integer) to authenticated;

create or replace function public.order_replenish(p_uid uuid, p_items text[], p_reason text, p_note text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
  new_code text;
  tries integer := 0;
begin
  select * into o from public.orders where uid = p_uid;
  if o.uid is null or not private.is_staff(o.branch) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_reason not in ('late', 'wrong', 'missing', 'damaged', 'quality', 'other') then raise exception 'Not a reason.' using errcode = '22023'; end if;
  if coalesce(array_length(p_items, 1), 0) not between 1 and 30
     or exists (select 1 from unnest(p_items) i where char_length(coalesce(i, '')) not between 1 and 200) then
    raise exception 'Choose the items to send.' using errcode = '22023';
  end if;
  loop
    new_code := 'M' || lpad((floor(random() * 1000000))::integer::text, 6, '0');
    exit when not exists (select 1 from public.orders where code = new_code);
    tries := tries + 1;
    if tries > 20 then raise exception 'No order number free.'; end if;
  end loop;
  insert into public.orders (uid, code, customer_id, clerk_id, branch, total, items, pay, fulfil, customer_name, customer_phone,
                             delivery_phone, address, location, location_from, gift_to, points, lang, replenish)
  values (gen_random_uuid(), new_code, o.customer_id, o.clerk_id, o.branch, 0, p_items, 'pickup', o.fulfil, o.customer_name,
          o.customer_phone, o.delivery_phone, o.address, o.location, o.location_from, o.gift_to, 0, o.lang,
          jsonb_build_object('of_uid', o.uid, 'of_code', o.code, 'reason', p_reason, 'note', nullif(left(coalesce(p_note, ''), 200), ''),
                             'by', (select private.my_uuid()), 'at', now()));
  return new_code;
end;
$$;
revoke all on function public.order_replenish(uuid, text[], text, text) from public, anon;
grant execute on function public.order_replenish(uuid, text[], text, text) to authenticated;

-- a paused branch refuses customers' orders, not the replenishments staff send
create or replace function private.orders_paused()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.replenish is not null then return new; end if;
  if exists (select 1 from public.branch_config b where b.branch = new.branch and coalesce((b.settings->>'paused')::boolean, false)) then
    raise exception 'This branch is not taking orders right now.' using errcode = 'P0010';
  end if;
  return new;
end;
$$;
