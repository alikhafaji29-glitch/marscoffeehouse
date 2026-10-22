-- The menu's "last changed" mark (owner, 2026-10-22: "build the menu fix"). Every open page used to read the whole
-- menu (about 44 kB) every minute, changed or not, which alone would come close to the free plan's 5 GB a month.
-- Now pages read this one row each minute (a few hundred bytes) and read the menu only when its time has moved.
-- The database moves it itself, after any change to the menu, its categories or the branches; nobody writes it.
create table if not exists public.menu_version (
  id smallint primary key default 1 check (id = 1),
  changed_at timestamptz not null default now()
);
insert into public.menu_version (id) values (1) on conflict (id) do nothing;
alter table public.menu_version enable row level security;
drop policy if exists "the menu's version is public" on public.menu_version;
create policy "the menu's version is public" on public.menu_version for select to anon, authenticated using (true);
revoke all on public.menu_version from anon, authenticated;
grant select on public.menu_version to anon, authenticated;

create or replace function private.menu_touched()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.menu_version set changed_at = clock_timestamp() where id = 1;
  return null;
end;
$$;
revoke all on function private.menu_touched() from public, anon, authenticated;

drop trigger if exists menu_items_touched on public.menu_items;
create trigger menu_items_touched after insert or update or delete on public.menu_items
  for each statement execute function private.menu_touched();
drop trigger if exists menu_categories_touched on public.menu_categories;
create trigger menu_categories_touched after insert or update or delete on public.menu_categories
  for each statement execute function private.menu_touched();
drop trigger if exists branches_touched on public.branches;
create trigger branches_touched after insert or update or delete on public.branches
  for each statement execute function private.menu_touched();
