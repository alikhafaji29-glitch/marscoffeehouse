-- A flavour may add to the price, and a category may move between the drinks and the food (owner, 2026-10-14).
--
-- 1. menu_items.flavor_extras: { "<flavour>": IQD } = what that flavour adds to the price of every size. A flavour
--    not named adds nothing. Every key must be one of the item's flavours; the row check enforces it and now also
--    runs when flavours or their extras change.
-- 2. menu_categories: staff of the branch may change `kind`, and a row for one of the catalogue's categories may
--    carry either kind (it was tied to the catalogue's).
alter table public.menu_items add column if not exists flavor_extras jsonb not null default '{}'::jsonb;
alter table public.menu_items drop constraint if exists menu_items_flavor_extras_shape;
alter table public.menu_items add constraint menu_items_flavor_extras_shape
  check (jsonb_typeof(flavor_extras) = 'object' and char_length(flavor_extras::text) <= 1000);
grant insert (flavor_extras) on public.menu_items to authenticated;
grant update (flavor_extras) on public.menu_items to authenticated;

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
  -- a flavour's extra: for one of the item's flavours, a whole amount from 0 to 2,000,000
  if exists (select 1 from jsonb_each(new.flavor_extras) e
             where not (e.key = any (new.flavors))
                or jsonb_typeof(e.value) <> 'number'
                or (case when jsonb_typeof(e.value) = 'number' then (e.value)::text::numeric not between 0 and 2000000 or (e.value)::text::numeric <> trunc((e.value)::text::numeric) else true end)) then
    raise exception 'menu item: a flavour''s extra must be an amount for one of the item''s flavours';
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
create trigger menu_items_check_new
  before insert or update of category, prices, sizes, names, description, flavors, flavor_extras on public.menu_items
  for each row execute function public.menu_items_check_new();

alter table public.menu_categories drop constraint if exists menu_categories_id_check;
alter table public.menu_categories add constraint menu_categories_id_check
  check (id ~ '^c-[a-z0-9-]{1,40}$'
         or id in ('coffeeMore', 'coffeeMilk', 'coldCoffee', 'refreshers', 'milkshake', 'mojito', 'smoothie', 'extra', 'matcha', 'autumn', 'sweets', 'savory'));
grant update (kind) on public.menu_categories to authenticated;
