-- The offer's service fee is for delivery orders only (owner, 2026-10-26: "pickup must not have service fee in erbil
-- positive hours"). Same as 20261025000300, except that a pickup order gets no fee (and loses one an old phone added).
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
  want := case when coalesce((cfg->>'feeOn')::boolean, false) and new.fulfil = 'delivery' then greatest(coalesce((cfg->>'fee')::integer, 0), 0) else 0 end;
  sent := coalesce((new.offer->>'fee')::integer, 0);
  if want = sent then return new; end if;
  new.total := greatest(new.total - sent + want, 0);
  new.offer := case when want > 0 then new.offer || jsonb_build_object('fee', want) else new.offer - 'fee' end;
  return new;
end;
$$;
revoke all on function private.orders_offer_fee() from public, anon, authenticated;
