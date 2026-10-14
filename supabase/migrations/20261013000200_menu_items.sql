-- Step 2 of the backend: the menu per branch.
-- Which items exist (names, categories, order) is the site's catalogue (src/menu.ts). This table holds what differs
-- per branch and what staff maintain: whether the branch sells the item, stock, price per size, tag, description,
-- flavours, and nutrition per size and flavour. Everyone may read it (it is the public menu); staff of the branch
-- change it; nobody adds or deletes rows through the API.
--
-- The first fill (2026-10-13) came from src/menuData.json, the two live menus as read that day, through
-- scripts/seed-menu.py and a one-time loader function that was dropped after the load. To load again, see HANDOFF.
create table if not exists public.menu_items (
  branch text not null check (branch in ('erbil', 'kirkuk')),
  name text not null check (char_length(name) between 1 and 80),          -- the catalogue's English name
  category text not null,                                                  -- the catalogue's category id
  available boolean not null default true,                                 -- the branch sells it
  in_stock boolean not null default true,
  prices integer[] not null check (cardinality(prices) between 1 and 2 and 0 <= all (prices) and 2000000 >= all (prices)),
  sizes text[] not null default '{}',                                      -- e.g. {8oz,12oz}; empty for one size
  tag text check (tag in ('top', 'premium', 'signature')),
  description jsonb not null default '{}'::jsonb,                          -- { en, ar, ku }
  flavors text[] not null default '{}',
  nutrition jsonb not null default '[]'::jsonb,                            -- [{ size, flavor, energy, fat, … }]
  updated_at timestamptz not null default now(),
  primary key (branch, name)
);
alter table public.menu_items enable row level security;

create or replace function public.menu_items_touch()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end;
$$;
revoke all on function public.menu_items_touch() from public, anon, authenticated;
drop trigger if exists menu_items_touch on public.menu_items;
create trigger menu_items_touch before update on public.menu_items for each row execute function public.menu_items_touch();

drop policy if exists "the menu is public" on public.menu_items;
create policy "the menu is public" on public.menu_items for select to anon, authenticated using (true);

drop policy if exists "staff maintain their branch's menu" on public.menu_items;
create policy "staff maintain their branch's menu" on public.menu_items
  for update to authenticated
  using ((select private.is_staff(branch)))
  with check ((select private.is_staff(branch)));

revoke all on public.menu_items from anon, authenticated;
grant select on public.menu_items to anon, authenticated;
grant update (available, in_stock, prices, tag, description, flavors, nutrition) on public.menu_items to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'menu_items') then
    alter publication supabase_realtime add table public.menu_items;
  end if;
end $$;
