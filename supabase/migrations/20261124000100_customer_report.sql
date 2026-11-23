-- Smart report (owner, 2026-11-23: "I want a smart report whose filter values I set myself from the website: who drinks
-- Spanish Latte every day, who has not come for a week or a month"). One row per customer of a branch (p_branch null =
-- every branch, the owner's sign-in only), counted for a period; the dashboard applies the thresholds (how many orders,
-- how long since the last one, …) and sorts. Managers only: a barista gets "not allowed".
--   A customer is a phone number (its last 10 digits; most orders are placed as a guest).
--   An order counts at the time it is for (a pre-order: its chosen time), as everywhere since decision 260.
--   Left out: test orders, free gifts (replenish), orders before the site went live, pre-orders whose time has not come.
--   orders / spent / delivery / pickup / offers / morning (before 12:00 Iraq) / afternoon (12 to 17) / evening /
--   fav (most bought item) / item_orders (orders holding one of p_items) / cat_orders (one of p_cat_items): the period,
--   cancelled orders not counted; cancelled = cancelled orders in the period.
--   ever / first_at / last_at: all time, cancelled orders not counted.
create or replace function public.customer_report(p_branch text, p_from timestamptz, p_to timestamptz, p_items text[] default '{}', p_cat_items text[] default '{}')
returns table (
  phone text, name text, branch text, orders integer, spent bigint, cancelled integer, delivery integer, pickup integer,
  offers integer, morning integer, afternoon integer, evening integer, item_orders integer, cat_orders integer, fav text,
  ever integer, first_at timestamptz, last_at timestamptz
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
      coalesce(case when x.offer->>'pre' = 'true' and x.offer->>'wantAt' is not null then to_timestamp((x.offer->>'wantAt')::bigint / 1000.0) end, x.created_at) as t
    from public.orders x
    where (p_branch is null or x.branch = p_branch) and x.replenish is null and x.created_at >= '2026-10-22T23:52:00Z'
      and not (coalesce(x.customer_name, '') ~* 'test' or coalesce(x.note, '') ~* 'test' or coalesce(x.cancel_reason, '') ~* 'test')
  ), v as (
    select *, extract(hour from t at time zone 'Asia/Baghdad')::integer as h from o where length(k) = 10 and t <= now()
  ), life as (
    select k, (count(*) filter (where st <> 'cancelled'))::integer as ever, min(t) filter (where st <> 'cancelled') as first_at, max(t) filter (where st <> 'cancelled') as last_at,
      (array_agg(nm order by t desc) filter (where coalesce(nm, '') <> ''))[1] as name, (array_agg(br order by t desc))[1] as branch
    from v group by k
  ), per as (
    select k, (count(*) filter (where st <> 'cancelled'))::integer as orders, coalesce(sum(amount) filter (where st <> 'cancelled'), 0)::bigint as spent,
      (count(*) filter (where st = 'cancelled'))::integer as cancelled,
      (count(*) filter (where st <> 'cancelled' and how = 'delivery'))::integer as delivery, (count(*) filter (where st <> 'cancelled' and how <> 'delivery'))::integer as pickup,
      (count(*) filter (where st <> 'cancelled' and combo))::integer as offers,
      (count(*) filter (where st <> 'cancelled' and h < 12))::integer as morning, (count(*) filter (where st <> 'cancelled' and h >= 12 and h < 17))::integer as afternoon,
      (count(*) filter (where st <> 'cancelled' and h >= 17))::integer as evening
    from v where t >= p_from and t < p_to group by k
  ), ln as ( -- "Iced Spanish Latte (14oz) · Oat milk ×2" → Iced Spanish Latte, 2
    select v.k, v.uid, regexp_replace(split_part(regexp_replace(l, '\s*×\d+\s*$', ''), ' · ', 1), '\s*\([^)]*\)\s*$', '') as item,
      coalesce((regexp_match(l, '×(\d+)\s*$'))[1]::integer, 1) as q
    from v cross join lateral unnest(v.lines) as l
    where v.st <> 'cancelled' and v.t >= p_from and v.t < p_to
  ), fav as (
    select distinct on (z.k) z.k, z.item from (select k, item, sum(q) as n from ln group by k, item) z order by z.k, z.n desc, z.item
  ), hit as (
    select k, (count(distinct uid) filter (where item = any (p_items)))::integer as item_orders, (count(distinct uid) filter (where item = any (p_cat_items)))::integer as cat_orders
    from ln group by k
  )
  select '0' || life.k, coalesce(life.name, ''), life.branch, coalesce(per.orders, 0), coalesce(per.spent, 0), coalesce(per.cancelled, 0), coalesce(per.delivery, 0),
    coalesce(per.pickup, 0), coalesce(per.offers, 0), coalesce(per.morning, 0), coalesce(per.afternoon, 0), coalesce(per.evening, 0),
    coalesce(hit.item_orders, 0), coalesce(hit.cat_orders, 0), coalesce(fav.item, ''), life.ever, life.first_at, life.last_at
  from life left join per on per.k = life.k left join fav on fav.k = life.k left join hit on hit.k = life.k;
end;
$$;
revoke all on function public.customer_report(text, timestamptz, timestamptz, text[], text[]) from public, anon;
grant execute on function public.customer_report(text, timestamptz, timestamptz, text[], text[]) to authenticated;
