-- The database sets an offer order's service fee itself (owner, 2026-10-25: "make the database add the branch's service
-- fee to Positive Hours orders itself, so a phone can't skip it"; #M402918 came in at 5,500 with no fee while Erbil's
-- 1,000 fee was on). On every new order with an offer (a Positive Hours combo order), the fee is taken from that branch's
-- offer in branch_config (the dashboard's Offers): `fee` when `feeOn`, else none; once per order, as the checkout has
-- always counted it. The total moves by the difference from what the phone sent, so its extras and combo count stay.
-- An offer the branch does not have (or a branch without settings) is left as the phone sent it.
create or replace function private.orders_offer_fee()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  cfg jsonb;
  want integer;
  sent integer;
begin
  if new.offer is null or jsonb_typeof(new.offer) <> 'object' then return new; end if;
  select o into cfg
    from public.branch_config b, jsonb_array_elements(case when jsonb_typeof(b.offers) = 'array' then b.offers else '[]'::jsonb end) o
    where b.branch = new.branch and (o->'name'->>'en' = new.offer->>'name' or (o->>'id' = 'positive' and new.offer->>'name' = 'Positive Hours'))
    order by (o->'name'->>'en' = new.offer->>'name') desc
    limit 1;
  if cfg is null then return new; end if;
  want := case when coalesce((cfg->>'feeOn')::boolean, false) then greatest(coalesce((cfg->>'fee')::integer, 0), 0) else 0 end;
  sent := coalesce((new.offer->>'fee')::integer, 0);
  if want = sent then return new; end if;
  new.total := greatest(new.total - sent + want, 0);
  new.offer := case when want > 0 then new.offer || jsonb_build_object('fee', want) else new.offer - 'fee' end;
  return new;
end;
$$;
revoke all on function private.orders_offer_fee() from public, anon, authenticated;
drop trigger if exists orders_offer_fee on public.orders;
create trigger orders_offer_fee before insert on public.orders
  for each row execute function private.orders_offer_fee();
