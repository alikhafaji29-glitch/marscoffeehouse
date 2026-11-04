-- The daily report stops (owner, 2026-11-03: "the daily will stop completly"; the weekly and monthly reports replace it once
-- mars_period_report was approved, 2026-11-04; HANDOFF decision 244). The edge function daily-report and its vault key stay: the
-- key is also used by the other reports, and the function only runs when called.
select cron.unschedule('mars-daily-report');
