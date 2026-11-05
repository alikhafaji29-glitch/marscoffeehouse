-- The owner's weekly and monthly reports, instead of the daily one (owner, 2026-11-03: "weekly 12:00 , monthly 12:01"; HANDOFF
-- decision 244). Times are Iraq, UTC+3. Weekly: Saturday 00:00 (Friday 21:00 UTC), for Saturday to Friday. Monthly: the 1st at
-- 00:01: pg_cron cannot say "last day of the month" in UTC, so it runs every night at 21:01 UTC and only calls on the 1st in Iraq.
select cron.schedule(
  'mars-weekly-report',
  '0 21 * * 5',
  $job$
  select net.http_get(
    url := 'https://tmvvcejuvypzhybmygmc.supabase.co/functions/v1/period-report?kind=weekly',
    headers := jsonb_build_object('x-report-key', (select decrypted_secret from vault.decrypted_secrets where name = 'daily_report_key')),
    timeout_milliseconds := 90000);
  $job$
);
select cron.schedule(
  'mars-monthly-report',
  '1 21 * * *',
  $job$
  select net.http_get(
    url := 'https://tmvvcejuvypzhybmygmc.supabase.co/functions/v1/period-report?kind=monthly',
    headers := jsonb_build_object('x-report-key', (select decrypted_secret from vault.decrypted_secrets where name = 'daily_report_key')),
    timeout_milliseconds := 90000)
  where extract(day from now() at time zone 'Asia/Baghdad') = 1;
  $job$
);
