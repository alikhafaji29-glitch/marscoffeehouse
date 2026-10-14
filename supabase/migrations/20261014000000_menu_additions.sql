-- Staff add to the menu from the dashboard (owner, 2026-10-14): a new item on their branch, and a new category.
-- Until now nobody could insert a menu row through the API and the categories lived only in the site's code.
--
-- 1. menu_categories: the categories staff added, per branch (the catalogue's own stay in src/menu.ts). Everyone
--    reads them; staff of the branch add one and may change its names and place. No delete through the API.
-- 2. menu_items: staff of the branch may insert a row (a new item, or a catalogue item their branch did not have)
--    and change an item's names (what customers read; `name` stays the key). A trigger checks every new row.
create table if not exists public.menu_categories (
  branch text not null check (branch in ('erbil', 'kirkuk')),
  id text not null check (id ~ '^c-[a-z0-9-]{1,40}$'),                     -- 'c-' keeps it apart from the catalogue's ids
  kind text not null check (kind in ('drink', 'food')),                    -- where it sits: with the drinks or the food
  names jsonb not null default '{}'::jsonb                                 -- { en, ar, ku }
    check (jsonb_typeof(names) = 'object' and char_length(names::text) <= 600),
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (branch, id)
);
alter table public.menu_categories enable row level security;

drop policy if exists "the menu's categories are public" on public.menu_categories;
create policy "the menu's categories are public" on public.menu_categories for select to anon, authenticated using (true);

drop policy if exists "staff add categories to their branch" on public.menu_categories;
create policy "staff add categories to their branch" on public.menu_categories
  for insert to authenticated
  with check ((select private.is_staff(branch)));

drop policy if exists "staff maintain their branch's categories" on public.menu_categories;
create policy "staff maintain their branch's categories" on public.menu_categories
  for update to authenticated
  using ((select private.is_staff(branch)))
  with check ((select private.is_staff(branch)));

revoke all on public.menu_categories from anon, authenticated;
grant select on public.menu_categories to anon, authenticated;
grant insert (branch, id, kind, names, sort) on public.menu_categories to authenticated;
grant update (names, sort) on public.menu_categories to authenticated;

create or replace function public.menu_categories_check_new()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.menu_categories c where c.branch = new.branch) >= 40 then
    raise exception 'menu: this branch has too many added categories';
  end if;
  return new;
end;
$$;
revoke all on function public.menu_categories_check_new() from public, anon, authenticated;
drop trigger if exists menu_categories_check_new on public.menu_categories;
create trigger menu_categories_check_new before insert on public.menu_categories for each row execute function public.menu_categories_check_new();

-- new menu rows
drop policy if exists "staff add to their branch's menu" on public.menu_items;
create policy "staff add to their branch's menu" on public.menu_items
  for insert to authenticated
  with check ((select private.is_staff(branch)));

grant insert (branch, name, category, available, in_stock, prices, sizes, tag, description, flavors, nutrition, names, sort)
  on public.menu_items to authenticated;
grant update (names) on public.menu_items to authenticated;

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
  if (select count(*) from public.menu_items m where m.branch = new.branch) >= 400 then
    raise exception 'menu: this branch has too many items';
  end if;
  return new;
end;
$$;
revoke all on function public.menu_items_check_new() from public, anon, authenticated;
drop trigger if exists menu_items_check_new on public.menu_items;
create trigger menu_items_check_new before insert on public.menu_items for each row execute function public.menu_items_check_new();
