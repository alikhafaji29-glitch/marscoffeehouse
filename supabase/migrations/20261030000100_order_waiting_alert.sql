-- Alert for an order nobody has started (owner, 2026-10-29: "sometimes the staff close the mars staff app and they don't
-- know that there is a new order request is pending, can we put a timer like in 10 minutes if nobody made this order as
-- preparing, we send a whatsapp msg to notify"; one alert per order, English; the number is set per branch in Tools,
-- branch_config.settings.alertPhone, "to be decided later" — no number, no message). HANDOFF decision 235.
--
-- An order is waiting from when it was placed, or for an order for later from when it moves to Active (its time minus
-- the branch's lead minutes, 20 when not set). After 10 minutes still at Order received → one row here and one WhatsApp
-- (edge function order-alert, template mars_order_waiting). Orders older than 3 hours are left alone.

create table if not exists public.order_alerts (
  order_uid uuid primary key references public.orders (uid) on delete cascade,
  branch text not null,
  at timestamptz not null default now(),
  status text,                -- sent / failed / no_number
  to_number text
);
alter table public.order_alerts enable row level security; -- no policies: only the service role reads or writes it

-- when an order started waiting for the staff
create or replace function private.waiting_since(o public.orders)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case when o.arrive_at is null then o.created_at
    else greatest(o.created_at, o.arrive_at - make_interval(mins => coalesce(
      (select (c.settings->>'lead')::int from public.branch_config c where c.branch = o.branch), 20))) end;
$$;

-- orders waiting over 10 minutes that have not had their alert (cheap check for the cron job)
create or replace function private.orders_waiting()
returns setof public.orders
language sql
stable
set search_path = ''
as $$
  select o.* from public.orders o
  where o.status = 'received'
    and o.created_at > now() - interval '1 day'
    and private.waiting_since(o) between now() - interval '3 hours' and now() - interval '10 minutes'
    and not exists (select 1 from public.order_alerts a where a.order_uid = o.uid);
$$;

-- the edge function's call: with the right key, records the alert for each waiting order and returns them, each once
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
    nullif(trim((select c.settings->>'alertPhone' from public.branch_config c where c.branch = w.branch)), '')
  from w join ins on ins.order_uid = w.uid;
end;
$$;
revoke all on function public.claim_waiting_orders(text) from public, anon, authenticated;
grant execute on function public.claim_waiting_orders(text) to service_role;
revoke all on function private.orders_waiting() from public, anon, authenticated;
revoke all on function private.waiting_since(public.orders) from public, anon, authenticated;

-- every minute: only when an order is waiting does it call the edge function
select cron.schedule(
  'mars-order-waiting',
  '* * * * *',
  $job$
  select net.http_get(
    url := 'https://tmvvcejuvypzhybmygmc.supabase.co/functions/v1/order-alert',
    headers := jsonb_build_object('x-report-key', (select decrypted_secret from vault.decrypted_secrets where name = 'daily_report_key')),
    timeout_milliseconds := 20000)
  where exists (select 1 from private.orders_waiting());
  $job$
);
