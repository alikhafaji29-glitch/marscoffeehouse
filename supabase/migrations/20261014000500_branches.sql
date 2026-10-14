-- Branches become rows (owner, 2026-10-14: "Add Branch" in the dashboard). Until now 'erbil' and 'kirkuk' were
-- written into the site's code and into a check on every table.
--
-- 1. branches: id (also the branch's storage folder and its key in every table), names { en, ar, ku }, `active`
--    (customers can choose it) and its place. Everyone reads them. Only the OWNER adds or changes one: a staff row
--    with branch null (= every branch). Nobody deletes a branch that has orders, menu rows or staff (foreign keys).
-- 2. orders, menu_items, menu_categories, staff: the branch must be a row of `branches` (was: one of two words).
-- 3. A photo's path and the storage rule follow the branch list too.
create table if not exists public.branches (
  id text primary key check (id ~ '^[a-z][a-z0-9-]{1,30}$'),
  names jsonb not null default '{}'::jsonb check (jsonb_typeof(names) = 'object' and char_length(names::text) <= 400),
  active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
insert into public.branches (id, names, active, sort) values
  ('erbil', '{"en":"Erbil","ar":"أربيل","ku":"هەولێر"}', true, 1),
  ('kirkuk', '{"en":"Kirkuk","ar":"كركوك","ku":"کەرکووک"}', true, 2)
on conflict (id) do nothing;
alter table public.branches enable row level security;

-- the owner: staff for every branch. Kept out of the API like is_staff (schema `private`).
create or replace function private.is_owner()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff s where s.user_id = (select auth.uid()) and s.branch is null);
$$;
revoke all on function private.is_owner() from public, anon;
grant execute on function private.is_owner() to authenticated;

drop policy if exists "the branches are public" on public.branches;
create policy "the branches are public" on public.branches for select to anon, authenticated using (true);
drop policy if exists "the owner adds branches" on public.branches;
create policy "the owner adds branches" on public.branches for insert to authenticated with check ((select private.is_owner()));
drop policy if exists "the owner changes branches" on public.branches;
create policy "the owner changes branches" on public.branches for update to authenticated
  using ((select private.is_owner())) with check ((select private.is_owner()));
drop policy if exists "the owner removes an empty branch" on public.branches;
create policy "the owner removes an empty branch" on public.branches for delete to authenticated using ((select private.is_owner()));

revoke all on public.branches from anon, authenticated;
grant select on public.branches to anon, authenticated;
grant insert (id, names, active, sort) on public.branches to authenticated;
grant update (names, active, sort) on public.branches to authenticated;
grant delete on public.branches to authenticated;

create or replace function public.branches_check_new()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.branches) >= 30 then
    raise exception 'too many branches';
  end if;
  return new;
end;
$$;
revoke all on function public.branches_check_new() from public, anon, authenticated;
drop trigger if exists branches_check_new on public.branches;
create trigger branches_check_new before insert on public.branches for each row execute function public.branches_check_new();

-- the other tables follow the list
alter table public.orders drop constraint if exists orders_branch_check;
alter table public.orders drop constraint if exists orders_branch_fkey;
alter table public.orders add constraint orders_branch_fkey foreign key (branch) references public.branches (id);
alter table public.menu_items drop constraint if exists menu_items_branch_check;
alter table public.menu_items drop constraint if exists menu_items_branch_fkey;
alter table public.menu_items add constraint menu_items_branch_fkey foreign key (branch) references public.branches (id);
alter table public.menu_categories drop constraint if exists menu_categories_branch_check;
alter table public.menu_categories drop constraint if exists menu_categories_branch_fkey;
alter table public.menu_categories add constraint menu_categories_branch_fkey foreign key (branch) references public.branches (id);
alter table public.staff drop constraint if exists staff_branch_fkey;
alter table public.staff add constraint staff_branch_fkey foreign key (branch) references public.branches (id);

-- a photo lives in its own branch's folder, whatever the branch is called
alter table public.menu_items drop constraint if exists menu_items_photo_path;
alter table public.menu_items add constraint menu_items_photo_path
  check (photo is null or (photo ~ '^[a-z][a-z0-9-]*/[a-z0-9-]{1,80}\.(webp|jpg)$' and split_part(photo, '/', 1) = branch));

drop policy if exists "staff add their branch's menu photos" on storage.objects;
create policy "staff add their branch's menu photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'menu'
              and exists (select 1 from public.branches b where b.id = (storage.foldername(name))[1])
              and (select private.is_staff((storage.foldername(name))[1])));
