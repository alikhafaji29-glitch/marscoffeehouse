-- Merging two orders keeps ONE service fee (owner, 2026-10-24, after testing the merge on the preview: "the 1000 IQD was
-- added twice; it should be per order"). Replaces merge_orders from 20261024000100: the merged order's fee is the larger
-- of the two (they are the same today), and the other order's fee comes off the total.
create or replace function public.merge_orders(keep_uid uuid, absorb_uid uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  k public.orders;
  a public.orders;
  combo_re constant text := ' · Combo (\d+)( ×\d+)$';
  k_items text[];
  moved text[] := '{}';
  shift int;
  line text;
  m text[];
  k_count int;
  a_count int;
  k_fee int;
  a_fee int;
begin
  if keep_uid = absorb_uid then raise exception 'Cannot merge an order into itself' using errcode = 'P0001'; end if;
  select * into k from public.orders where uid = keep_uid for update;
  select * into a from public.orders where uid = absorb_uid for update;
  if k.uid is null or a.uid is null then raise exception 'Order not found' using errcode = 'P0002'; end if;
  if not (select private.is_staff(k.branch)) then raise exception 'Only the branch''s staff can merge orders' using errcode = '42501'; end if;
  if k.branch <> a.branch then raise exception 'The orders are for different branches' using errcode = 'P0001'; end if;
  if k.status in ('delivered', 'cancelled') or a.status in ('delivered', 'cancelled') then
    raise exception 'Only open orders can be merged' using errcode = 'P0001';
  end if;
  if length(regexp_replace(coalesce(k.delivery_phone, k.customer_phone, ''), '\D', '', 'g')) < 9
     or right(regexp_replace(coalesce(k.delivery_phone, k.customer_phone, ''), '\D', '', 'g'), 9)
        <> right(regexp_replace(coalesce(a.delivery_phone, a.customer_phone, ''), '\D', '', 'g'), 9) then
    raise exception 'The orders are from different customers' using errcode = 'P0001';
  end if;

  -- a one-combo order has no "· Combo n" in its lines: number it Combo 1 so the combos stay apart after the merge
  k_items := k.items;
  if k.offer is not null and not exists (select 1 from unnest(k_items) x where x ~ combo_re) then
    k_items := array(select regexp_replace(x, '( ×\d+)$', ' · Combo 1\1') from unnest(k_items) x);
  end if;
  shift := coalesce((select max((regexp_match(x, combo_re))[1]::int) from unnest(k_items) x), 0);
  foreach line in array a.items loop
    m := regexp_match(line, '^(.*) · Combo (\d+)( ×\d+)$');
    if m is not null then
      moved := moved || (m[1] || ' · Combo ' || (m[2]::int + shift) || m[3]);
    elsif a.offer is not null then
      moved := moved || regexp_replace(line, '( ×\d+)$', ' · Combo ' || (shift + 1) || '\1');
    else
      moved := moved || line;
    end if;
  end loop;

  k_count := case when k.offer is null then 0 else coalesce((k.offer ->> 'count')::int, 1) end;
  -- the service fee is per order (owner, 2026-10-24): the merged order keeps one, the other's comes off the total
  k_fee := coalesce((k.offer ->> 'fee')::int, 0);
  a_fee := coalesce((a.offer ->> 'fee')::int, 0);
  a_count := case when a.offer is null then 0 else coalesce((a.offer ->> 'count')::int, 1) end;
  update public.orders set
    items = k_items || moved,
    total = k.total + a.total - least(k_fee, a_fee),
    note = nullif(concat_ws(' · ', nullif(k.note, ''), nullif(a.note, '')), ''),
    offer = case when k.offer is null and a.offer is null then null
      else (coalesce(k.offer, a.offer) - 'count' - 'fee') || jsonb_strip_nulls(jsonb_build_object(
        'count', nullif(k_count + a_count, 1),
        'fee', nullif(greatest(k_fee, a_fee), 0))) end,
    address = coalesce(nullif(k.address, ''), a.address),
    location = coalesce(k.location, a.location)
  where uid = k.uid;
  update public.orders set status = 'cancelled', cancel_reason = 'merged:' || k.code where uid = a.uid;
end;
$$;
revoke all on function public.merge_orders(uuid, uuid) from public, anon;
grant execute on function public.merge_orders(uuid, uuid) to authenticated;
