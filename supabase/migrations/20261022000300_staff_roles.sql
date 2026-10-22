-- Two kinds of staff per branch (owner, 2026-10-22: "two users for each branch, one of them only sees orders for
-- baristas, and the other one for management, that sees the rest of the tabs"):
--   barista: the branch's orders (sees them and moves them through the stages), nothing else
--   manager: everything for the branch: orders, menu, photos, categories, offers and settings
-- The owner (branch null) is a manager of every branch. Orders keep `private.is_staff` (both kinds); everything else
-- now asks `private.is_manager`, so a barista's sign-in cannot change the menu or settings even outside the dashboard.
alter table public.staff add column if not exists role text not null default 'manager';
alter table public.staff drop constraint if exists staff_role_check;
alter table public.staff add constraint staff_role_check check (role in ('barista', 'manager'));

create or replace function private.is_manager(for_branch text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff s
    where s.user_id = (select auth.uid())
      and s.role = 'manager'
      and (s.branch is null or s.branch = for_branch)
  );
$$;
revoke all on function private.is_manager(text) from public, anon;
grant execute on function private.is_manager(text) to authenticated;

-- the menu
drop policy if exists "staff add to their branch's menu" on public.menu_items;
create policy "staff add to their branch's menu" on public.menu_items for insert to authenticated
  with check ((select private.is_manager(branch)));
drop policy if exists "staff maintain their branch's menu" on public.menu_items;
create policy "staff maintain their branch's menu" on public.menu_items for update to authenticated
  using ((select private.is_manager(branch))) with check ((select private.is_manager(branch)));
drop policy if exists "staff delete from their branch's menu" on public.menu_items;
create policy "staff delete from their branch's menu" on public.menu_items for delete to authenticated
  using ((select private.is_manager(branch)));

-- its categories
drop policy if exists "staff add categories to their branch" on public.menu_categories;
create policy "staff add categories to their branch" on public.menu_categories for insert to authenticated
  with check ((select private.is_manager(branch)));
drop policy if exists "staff maintain their branch's categories" on public.menu_categories;
create policy "staff maintain their branch's categories" on public.menu_categories for update to authenticated
  using ((select private.is_manager(branch))) with check ((select private.is_manager(branch)));
drop policy if exists "staff delete their branch's categories" on public.menu_categories;
create policy "staff delete their branch's categories" on public.menu_categories for delete to authenticated
  using ((select private.is_manager(branch)));

-- the branch's settings and offers
drop policy if exists "staff set up their branch" on public.branch_config;
create policy "staff set up their branch" on public.branch_config for insert to authenticated
  with check ((select private.is_manager(branch)));
drop policy if exists "staff change their branch's settings" on public.branch_config;
create policy "staff change their branch's settings" on public.branch_config for update to authenticated
  using ((select private.is_manager(branch))) with check ((select private.is_manager(branch)));

-- the menu's photos (folder = branch)
drop policy if exists "staff add their branch's menu photos" on storage.objects;
create policy "staff add their branch's menu photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'menu' and exists (select 1 from public.branches b where b.id = (storage.foldername(name))[1])
    and (select private.is_manager((storage.foldername(name))[1])));
drop policy if exists "staff remove their branch's menu photos" on storage.objects;
create policy "staff remove their branch's menu photos" on storage.objects for delete to authenticated
  using (bucket_id = 'menu' and (select private.is_manager((storage.foldername(name))[1])));
drop policy if exists "staff see their branch's menu photos" on storage.objects;
create policy "staff see their branch's menu photos" on storage.objects for select to authenticated
  using (bucket_id = 'menu' and (select private.is_manager((storage.foldername(name))[1])));
