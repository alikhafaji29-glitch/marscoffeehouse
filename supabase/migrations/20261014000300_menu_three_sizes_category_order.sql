-- A third size, and the branch's own order and names for every category (owner, 2026-10-14).
--
-- 1. menu_items: up to three sizes (prices 1 to 3; sizes none, two or three, a price each, names of 12 characters
--    at most). Staff of the branch may now change `sizes`.
-- 2. menu_categories: a row may also be for one of the catalogue's categories (its id). Such a row holds what the
--    branch changed about it: its names and its place. `kind` must agree with the catalogue (sweets and savory are
--    food). The catalogue's categories without a row keep the site's names and order (place 10, 20, … 120).
alter table public.menu_items drop constraint if exists menu_items_prices_check;
alter table public.menu_items add constraint menu_items_prices_check
  check (cardinality(prices) between 1 and 3 and 0 <= all (prices) and 2000000 >= all (prices));
alter table public.menu_items drop constraint if exists menu_items_sizes_names;
alter table public.menu_items add constraint menu_items_sizes_names
  check (cardinality(sizes) <= 3 and char_length(array_to_string(sizes, '')) <= 36);
grant update (sizes) on public.menu_items to authenticated;

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
  -- one price, or two or three sizes with a price each and different names
  if not ((cardinality(new.sizes) = 0 and cardinality(new.prices) = 1)
          or (cardinality(new.sizes) in (2, 3) and cardinality(new.prices) = cardinality(new.sizes))) then
    raise exception 'menu item: one price, or two or three sizes with a price each';
  end if;
  if exists (select 1 from unnest(new.sizes) z where btrim(z) = '' or char_length(z) > 12)
     or (select count(distinct lower(z)) from unnest(new.sizes) z) <> cardinality(new.sizes) then
    raise exception 'menu item: every size needs its own short name';
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

alter table public.menu_categories drop constraint if exists menu_categories_id_check;
alter table public.menu_categories add constraint menu_categories_id_check
  check (id ~ '^c-[a-z0-9-]{1,40}$'
         or (id in ('coffeeMore', 'coffeeMilk', 'coldCoffee', 'refreshers', 'milkshake', 'mojito', 'smoothie', 'extra', 'matcha', 'autumn') and kind = 'drink')
         or (id in ('sweets', 'savory') and kind = 'food'));
