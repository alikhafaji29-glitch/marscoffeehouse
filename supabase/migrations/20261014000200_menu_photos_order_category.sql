-- Staff give an item a photo, change the order of a category's items and move an item to another category
-- (owner, 2026-10-14).
--
-- 1. menu_items.photo: the photo's path in the `menu` storage bucket, '<branch>/<file>.webp|jpg'. Null = none.
-- 2. Staff of the branch may now also change photo, sort and category. The check that ran on new rows runs on these
--    changes too (the category must be the catalogue's or one the branch added).
-- 3. The `menu` storage bucket: public to read by address (it holds only menu photos), 1 MB a file, WebP or JPEG.
--    Staff of a branch add and remove files in their branch's folder; nobody else writes.
alter table public.menu_items add column if not exists photo text;
alter table public.menu_items drop constraint if exists menu_items_photo_path;
alter table public.menu_items add constraint menu_items_photo_path
  check (photo is null or (photo ~ '^[a-z]+/[a-z0-9-]{1,80}\.(webp|jpg)$' and split_part(photo, '/', 1) = branch));

grant insert (photo) on public.menu_items to authenticated;
grant update (photo, sort, category) on public.menu_items to authenticated;

create or replace function public.menu_items_check_new()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.name <> btrim(new.name) then
    raise exception 'menu item: the name starts or ends with a space';
  end if;
  -- its category is one of the catalogue's or one this branch added
  if not (new.category = any (array['coffeeMore', 'coffeeMilk', 'coldCoffee', 'refreshers', 'milkshake', 'mojito', 'smoothie',
                                    'extra', 'matcha', 'autumn', 'sweets', 'savory'])
          or exists (select 1 from public.menu_categories c where c.branch = new.branch and c.id = new.category)) then
    raise exception 'menu item: unknown category %', new.category;
  end if;
  -- one price, or two sizes with a price each
  if not ((cardinality(new.sizes) = 0 and cardinality(new.prices) = 1) or (cardinality(new.sizes) = 2 and cardinality(new.prices) = 2)) then
    raise exception 'menu item: one price, or two sizes with two prices';
  end if;
  if char_length(new.names::text) > 600 or char_length(new.description::text) > 6000 then
    raise exception 'menu item: the names or the description are too long';
  end if;
  if tg_op = 'INSERT' and (select count(*) from public.menu_items m where m.branch = new.branch) >= 400 then
    raise exception 'menu: this branch has too many items';
  end if;
  return new;
end;
$$;
revoke all on function public.menu_items_check_new() from public, anon, authenticated;
drop trigger if exists menu_items_check_new on public.menu_items;
create trigger menu_items_check_new before insert or update of category, prices, sizes, names, description on public.menu_items
  for each row execute function public.menu_items_check_new();

-- the photos
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menu', 'menu', true, 1048576, array['image/webp', 'image/jpeg'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "staff see their branch's menu photos" on storage.objects;
create policy "staff see their branch's menu photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'menu' and (select private.is_staff((storage.foldername(name))[1])));

drop policy if exists "staff add their branch's menu photos" on storage.objects;
create policy "staff add their branch's menu photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'menu' and (storage.foldername(name))[1] in ('erbil', 'kirkuk') and (select private.is_staff((storage.foldername(name))[1])));

drop policy if exists "staff remove their branch's menu photos" on storage.objects;
create policy "staff remove their branch's menu photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'menu' and (select private.is_staff((storage.foldername(name))[1])));
