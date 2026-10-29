-- The owner's daily report on WhatsApp (owner, 2026-10-29: "can we send daily reports to the owner?"; WhatsApp, next
-- morning about 9 am, separate per branch, English; HANDOFF decision 232). pg_cron calls the edge function daily-report
-- at 06:00 UTC (09:00 Iraq) through pg_net, with a key kept in the vault; the function asks the database whether the
-- key is right and gets the number to send to (both in the vault, never in the code or the site).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- the key and the owner's number: made once (the key at random), only the database and the function ever read them
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'daily_report_key') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'daily_report_key', 'daily-report edge function: the cron job''s key');
  end if;
  if not exists (select 1 from vault.secrets where name = 'daily_report_to') then
    perform vault.create_secret('07706602617', 'daily_report_to', 'the owner''s WhatsApp number for the daily report');
  end if;
end $$;

-- the edge function's check: the number to send to when the key is right, else null (service role only)
create or replace function public.daily_report_config(p_key text)
returns text
language sql
security definer
set search_path = ''
as $$
  select (select decrypted_secret from vault.decrypted_secrets where name = 'daily_report_to')
  where p_key is not null and p_key = (select decrypted_secret from vault.decrypted_secrets where name = 'daily_report_key');
$$;
revoke all on function public.daily_report_config(text) from public, anon, authenticated;
grant execute on function public.daily_report_config(text) to service_role;

-- every day at 06:00 UTC = 09:00 Iraq: yesterday's report, one WhatsApp per branch
select cron.schedule(
  'mars-daily-report',
  '0 6 * * *',
  $job$
  select net.http_get(
    url := 'https://tmvvcejuvypzhybmygmc.supabase.co/functions/v1/daily-report',
    headers := jsonb_build_object('x-report-key', (select decrypted_secret from vault.decrypted_secrets where name = 'daily_report_key')),
    timeout_milliseconds := 30000);
  $job$
);
