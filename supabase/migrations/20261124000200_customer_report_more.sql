-- Smart report, more filters (owner, 2026-11-24: "add the first 4 filters": days of the week, average order, delivery
-- company, got a discount or a free gift). The function gains four period columns; the average is worked out in the
-- dashboard from spent / orders.
--   dow        orders per day of the week in Iraq time, 7 numbers, Sunday first
--   couriers   the delivery companies that carried the customer's delivery orders
--   discounts  orders with a discount
--   gifts      free gifts received (replenish orders). A gift is still not an order: it is in no other column.
-- The return type changes, so the function is dropped and made again (the live site does not call it yet).
drop function if exists public.customer_report(text, timestamptz, timestamptz, text[], text[]);
create function public.customer_report(p_branch text, p_from timestamptz, p_to timestamptz, p_items text[] default '{}', p_cat_items text[] default '{}')
returns table (
  phone text, name text, branch text, orders integer, spent bigint, cancelled integer, delivery integer, pickup integer,
  offers integer, morning integer, afternoon integer, evening integer, item_orders integer, cat_orders integer, fav text,
  ever integer, first_at timestamptz, last_at timestamptz, dow integer[], couriers text[], discounts integer, gifts integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not exists (select 1 from public.staff s where s.user_id = (select private.my_uuid()) and s.role = 'manager' and (s.branch is null or s.branch = p_branch)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  with o as (
    select x.uid, right(regexp_replace(coalesce(nullif(x.delivery_phone, ''), x.customer_phone, ''), '\D', '', 'g'), 10) as k,
      x.customer_name as nm, x.branch as br, x.status as st, x.fulfil as how, x.total as amount, x.items as lines, x.offer is not null as combo,
      x.replenish is not null as gift, x.discount is not null as disc, nullif(x.courier, '') as carrier,
      coalesce(case when x.offer->>'pre' = 'true' and x.offer->>'wantAt' is not null then to_timestamp((x.offer->>'wantAt')::bigint / 1000.0) end, x.created_at) as t
    from public.orders x
    where (p_branch is null or x.branch = p_branch) and x.created_at >= '2026-10-22T23:52:00Z'
      and not (coalesce(x.customer_name, '') ~* 'test' or coalesce(x.note, '') ~* 'test' or coalesce(x.cancel_reason, '') ~* 'test')
  ), v as (
    select *, extract(hour from t at time zone 'Asia/Baghdad')::integer as h, extract(dow from t at time zone 'Asia/Baghdad')::integer as d,
      st <> 'cancelled' and not gift as sale
    from o where length(k) = 10 and t <= now()
  ), life as (
    select k, (count(*) filter (where sale))::integer as ever, min(t) filter (where sale) as first_at, max(t) filter (where sale) as last_at,
      (array_agg(nm order by t desc) filter (where coalesce(nm, '') <> ''))[1] as name, (array_agg(br order by t desc))[1] as branch
    from v group by k
  ), per as (
    select k, (count(*) filter (where sale))::integer as orders, coalesce(sum(amount) filter (where sale), 0)::bigint as spent,
      (count(*) filter (where st = 'cancelled' and not gift))::integer as cancelled,
      (count(*) filter (where sale and how = 'delivery'))::integer as delivery, (count(*) filter (where sale and how <> 'delivery'))::integer as pickup,
      (count(*) filter (where sale and combo))::integer as offers,
      (count(*) filter (where sale and h < 12))::integer as morning, (count(*) filter (where sale and h >= 12 and h < 17))::integer as afternoon,
      (count(*) filter (where sale and h >= 17))::integer as evening,
      array[(count(*) filter (where sale and d = 0))::integer, (count(*) filter (where sale and d = 1))::integer, (count(*) filter (where sale and d = 2))::integer,
            (count(*) filter (where sale and d = 3))::integer, (count(*) filter (where sale and d = 4))::integer, (count(*) filter (where sale and d = 5))::integer,
            (count(*) filter (where sale and d = 6))::integer] as dow,
      coalesce(array_agg(distinct carrier) filter (where sale and how = 'delivery' and carrier is not null), '{}') as couriers,
      (count(*) filter (where sale and disc))::integer as discounts,
      (count(*) filter (where gift and st <> 'cancelled'))::integer as gifts
    from v where t >= p_from and t < p_to group by k
  ), ln as ( -- "Iced Spanish Latte (14oz) · Oat milk ×2" → Iced Spanish Latte, 2
    select v.k, v.uid, regexp_replace(split_part(regexp_replace(l, '\s*×\d+\s*$', ''), ' · ', 1), '\s*\([^)]*\)\s*$', '') as item,
      coalesce((regexp_match(l, '×(\d+)\s*$'))[1]::integer, 1) as q
    from v cross join lateral unnest(v.lines) as l
    where v.sale and v.t >= p_from and v.t < p_to
  ), fav as (
    select distinct on (z.k) z.k, z.item from (select k, item, sum(q) as n from ln group by k, item) z order by z.k, z.n desc, z.item
  ), hit as (
    select k, (count(distinct uid) filter (where item = any (p_items)))::integer as item_orders, (count(distinct uid) filter (where item = any (p_cat_items)))::integer as cat_orders
    from ln group by k
  )
  select '0' || life.k, coalesce(life.name, ''), life.branch, coalesce(per.orders, 0), coalesce(per.spent, 0), coalesce(per.cancelled, 0), coalesce(per.delivery, 0),
    coalesce(per.pickup, 0), coalesce(per.offers, 0), coalesce(per.morning, 0), coalesce(per.afternoon, 0), coalesce(per.evening, 0),
    coalesce(hit.item_orders, 0), coalesce(hit.cat_orders, 0), coalesce(fav.item, ''), life.ever, life.first_at, life.last_at,
    coalesce(per.dow, array[0, 0, 0, 0, 0, 0, 0]), coalesce(per.couriers, '{}'), coalesce(per.discounts, 0), coalesce(per.gifts, 0)
  from life left join per on per.k = life.k left join fav on fav.k = life.k left join hit on hit.k = life.k;
end;
$$;
revoke all on function public.customer_report(text, timestamptz, timestamptz, text[], text[]) from public, anon;
grant execute on function public.customer_report(text, timestamptz, timestamptz, text[], text[]) to authenticated;
