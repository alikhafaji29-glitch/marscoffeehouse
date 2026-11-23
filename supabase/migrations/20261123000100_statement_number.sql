-- The nightly delivery statements go to their own number (owner, 2026-11-23: "change the automatic delivery statment to
-- this number"), not to the one the daily / weekly / monthly reports use. The number is the vault secret
-- `delivery_statement_to` (set by hand with vault.create_secret, never written in a file). No change to the edge
-- function: its nightly job now sends the report key with ":statement" after it, and the database answers that key with
-- the statements' number (the reports' number when none is set). The plain key still answers with the reports' number.
create or replace function public.daily_report_config(p_key text)
returns text
language sql
security definer
set search_path = ''
as $$
  select case
    when p_key = k.key then (select decrypted_secret from vault.decrypted_secrets where name = 'daily_report_to')
    when p_key = k.key || ':statement' then coalesce(
      (select decrypted_secret from vault.decrypted_secrets where name = 'delivery_statement_to'),
      (select decrypted_secret from vault.decrypted_secrets where name = 'daily_report_to'))
  end
  from (select decrypted_secret as key from vault.decrypted_secrets where name = 'daily_report_key') k
  where p_key is not null and k.key is not null;
$$;
revoke all on function public.daily_report_config(text) from public, anon, authenticated;
grant execute on function public.daily_report_config(text) to service_role;

select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'mars-delivery-statement'),
  command := $cmd$
  select net.http_get(
    url := 'https://tmvvcejuvypzhybmygmc.supabase.co/functions/v1/delivery-statement',
    headers := jsonb_build_object('x-report-key', (select decrypted_secret from vault.decrypted_secrets where name = 'daily_report_key') || ':statement'),
    timeout_milliseconds := 60000);
  $cmd$
);
