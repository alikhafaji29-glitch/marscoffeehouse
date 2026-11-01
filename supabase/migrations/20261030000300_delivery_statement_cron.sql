-- Nightly delivery-company PDF statements to the owner (owner, 2026-10-29: "the owner reciecves it, include number,
-- english, 12:00 midnight"; HANDOFF decision 234). 21:00 UTC = 00:00 Iraq: the day that just ended, one PDF per company
-- per branch, edge function delivery-statement, same vault key as the daily report.
select cron.schedule(
  'mars-delivery-statement',
  '0 21 * * *',
  $job$
  select net.http_get(
    url := 'https://tmvvcejuvypzhybmygmc.supabase.co/functions/v1/delivery-statement',
    headers := jsonb_build_object('x-report-key', (select decrypted_secret from vault.decrypted_secrets where name = 'daily_report_key')),
    timeout_milliseconds := 60000);
  $job$
);
