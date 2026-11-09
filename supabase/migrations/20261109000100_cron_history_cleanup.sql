-- Keep pg_cron's run history to the last 7 days (owner, 2026-11-09: "what does the scheduled-job cleanup do?" → "ok do
-- it"; HANDOFF decision 253). cron.job_run_details gets one row per run of every job; mars-order-waiting runs every
-- minute (1,440 rows a day: 14,673 rows / 7.3 MB by 2026-11-09, ~180 MB a year), and nothing reads them after a few days.
-- Every night at 01:30 Iraq time (22:30 UTC, before the 02:00 backup) rows older than 7 days are deleted. Orders, the
-- WhatsApp log (wa_messages), order_alerts and the jobs themselves are not touched.
select cron.unschedule('mars-cron-history-cleanup') where exists (select 1 from cron.job where jobname = 'mars-cron-history-cleanup');
select cron.schedule(
  'mars-cron-history-cleanup',
  '30 22 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$
);
