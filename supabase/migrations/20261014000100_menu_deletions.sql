-- Staff delete from the menu (owner, 2026-10-14): an item of their branch, and a category they added once it is empty.
-- Flavours were already theirs to change (update grant of 20261013000200); they get a size limit here.
drop policy if exists "staff delete from their branch's menu" on public.menu_items;
create policy "staff delete from their branch's menu" on public.menu_items
  for delete to authenticated
  using ((select private.is_staff(branch)));
grant delete on public.menu_items to authenticated;

drop policy if exists "staff delete their branch's categories" on public.menu_categories;
create policy "staff delete their branch's categories" on public.menu_categories
  for delete to authenticated
  using ((select private.is_staff(branch)));
grant delete on public.menu_categories to authenticated;

-- a category goes only when the branch has no item left in it
create or replace function public.menu_categories_check_gone()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.menu_items m where m.branch = old.branch and m.category = old.id) then
    raise exception 'menu: this category still has items';
  end if;
  return old;
end;
$$;
revoke all on function public.menu_categories_check_gone() from public, anon, authenticated;
drop trigger if exists menu_categories_check_gone on public.menu_categories;
create trigger menu_categories_check_gone before delete on public.menu_categories for each row execute function public.menu_categories_check_gone();

-- at most 12 flavours of at most 30 characters each
alter table public.menu_items drop constraint if exists menu_items_flavors_size;
alter table public.menu_items add constraint menu_items_flavors_size
  check (cardinality(flavors) <= 12 and char_length(array_to_string(flavors, '')) <= 360);
