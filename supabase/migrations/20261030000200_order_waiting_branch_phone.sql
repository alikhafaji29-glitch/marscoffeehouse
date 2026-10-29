-- The pending-order alert goes to the branch's phone (owner, 2026-10-30: "mars order waiting will be sent to the
-- branch's phone"): Tools → Branch phone number, settings.phone, instead of a separate alert number. HANDOFF 235.
create or replace function public.claim_waiting_orders(p_key text)
returns table (uid uuid, code text, branch text, customer_name text, total integer, mins integer, alert_phone text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_key is null or p_key is distinct from (select decrypted_secret from vault.decrypted_secrets where name = 'daily_report_key') then
    return;
  end if;
  return query
  with w as (select * from private.orders_waiting()),
  ins as (
    insert into public.order_alerts (order_uid, branch)
    select w.uid, w.branch from w
    on conflict (order_uid) do nothing
    returning order_alerts.order_uid
  )
  select w.uid, w.code, w.branch, w.customer_name, w.total,
    greatest(10, floor(extract(epoch from now() - private.waiting_since(w)) / 60))::int,
    nullif(trim((select c.settings->>'phone' from public.branch_config c where c.branch = w.branch)), '')
  from w join ins on ins.order_uid = w.uid;
end;
$$;
revoke all on function public.claim_waiting_orders(text) from public, anon, authenticated;
grant execute on function public.claim_waiting_orders(text) to service_role;

-- the separate number is gone
update public.branch_config set settings = settings - 'alertPhone' where settings ? 'alertPhone';
