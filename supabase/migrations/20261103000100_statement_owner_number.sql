-- The owner's number for a statement staff send again from Deliveries (owner, 2026-11-03: "exports same form of the sent
-- pdf, so if they want to adjust it and resend it or download it they can"; HANDOFF decision 243). The edge function checks
-- the caller is staff; the number stays in the vault and is never sent to the site.
create or replace function public.daily_report_owner()
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'daily_report_to';
$$;
revoke all on function public.daily_report_owner() from public, anon, authenticated;
grant execute on function public.daily_report_owner() to service_role;
