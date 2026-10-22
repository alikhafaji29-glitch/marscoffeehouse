-- Each branch's own settings and offers, in the database (owner, 2026-10-22: "two branches ... each unique"; step 3
-- of going live). Until now they were kept on the device where staff changed them, so customers never got them.
--   settings: how orders reach the staff, WhatsApp number, delivery / pickup, the Later lead (the dashboard's Tools)
--   offers:   the branch's offers, Positive Hours first (price, hours, steps, service fee, free delivery)
-- Everyone reads them (the website needs them, and the WhatsApp number is the one customers write to); the staff of
-- the branch, or the owner, write them. A change moves the menu's "last changed" mark, so open pages read it within
-- a minute (decision 128).
create table if not exists public.branch_config (
  branch text primary key references public.branches (id) on delete cascade,
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object' and pg_column_size(settings) <= 8192),
  offers jsonb not null default '[]'::jsonb check (jsonb_typeof(offers) = 'array' and pg_column_size(offers) <= 65536),
  updated_at timestamptz not null default now()
);
alter table public.branch_config enable row level security;

drop policy if exists "branch settings are public" on public.branch_config;
create policy "branch settings are public" on public.branch_config for select to anon, authenticated using (true);
drop policy if exists "staff set up their branch" on public.branch_config;
create policy "staff set up their branch" on public.branch_config for insert to authenticated
  with check ((select private.is_staff(branch)));
drop policy if exists "staff change their branch's settings" on public.branch_config;
create policy "staff change their branch's settings" on public.branch_config for update to authenticated
  using ((select private.is_staff(branch))) with check ((select private.is_staff(branch)));

revoke all on public.branch_config from anon, authenticated;
grant select on public.branch_config to anon, authenticated;
grant insert (branch, settings, offers) on public.branch_config to authenticated;
grant update (settings, offers) on public.branch_config to authenticated;

create or replace function public.branch_config_stamp()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.branch_config_stamp() from public, anon, authenticated;
drop trigger if exists branch_config_stamp on public.branch_config;
create trigger branch_config_stamp before insert or update on public.branch_config
  for each row execute function public.branch_config_stamp();

drop trigger if exists branch_config_touched on public.branch_config;
create trigger branch_config_touched after insert or update or delete on public.branch_config
  for each statement execute function private.menu_touched();
