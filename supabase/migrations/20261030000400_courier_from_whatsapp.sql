-- An order sent to a delivery company on WhatsApp is that company's order (owner, 2026-10-30: "i see orders messages sent
-- to them on 29 why you didn't count it for them"). Until now orders.courier was only set by hand (the order's "Delivery
-- company" menu), so the Deliveries report and the nightly statements missed every order that was only sent. Now each
-- WhatsApp sent to a name in the branch's driver list (Tools → Delivery drivers; name, or phone when it has no name)
-- sets the order's company; the latest send wins, the menu still changes it. Customer / owner / test / alert messages
-- and failed sends change nothing. HANDOFF decision 236.
create or replace function private.courier_from_wa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare d text := trim(coalesce(new.driver, ''));
begin
  if new.status = 'failed' or d = '' or new.order_code is null then return new; end if;
  if not exists (
    select 1 from public.branch_config c, jsonb_array_elements(coalesce(c.settings->'drivers', '[]'::jsonb)) x
    where c.branch = new.branch and trim(coalesce(nullif(x->>'name', ''), x->>'phone', '')) = d
  ) then return new; end if;
  update public.orders set courier = left(d, 40)
  where code = new.order_code and branch = new.branch and fulfil = 'delivery' and courier is distinct from left(d, 40);
  return new;
end;
$$;
revoke all on function private.courier_from_wa() from public, anon, authenticated;

drop trigger if exists wa_messages_courier on public.wa_messages;
create trigger wa_messages_courier after insert on public.wa_messages
  for each row execute function private.courier_from_wa();

-- the orders already sent but never marked: the company of their latest successful send
with sent as (
  select distinct on (w.order_code, w.branch) w.order_code, w.branch, trim(w.driver) d
  from public.wa_messages w
  where w.status <> 'failed' and exists (
    select 1 from public.branch_config c, jsonb_array_elements(coalesce(c.settings->'drivers', '[]'::jsonb)) x
    where c.branch = w.branch and trim(coalesce(nullif(x->>'name', ''), x->>'phone', '')) = trim(w.driver))
  order by w.order_code, w.branch, w.created_at desc
)
update public.orders o set courier = left(s.d, 40)
from sent s
where o.code = s.order_code and o.branch = s.branch and o.fulfil = 'delivery' and o.courier is null;
