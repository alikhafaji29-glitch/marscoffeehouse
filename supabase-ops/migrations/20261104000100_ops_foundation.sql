-- Mars Ops (Supabase project detfredqthepqdynmluf, Frankfurt; owner, 2026-11-04: "Approve, start"; HANDOFF decision 246):
-- the warehouse, branch stock, POS and Master. Week 1: branches, staff and their roles, raw materials and suppliers.
-- This project is separate from the website (Project 1, tmvvcejuvypzhybmygmc); nothing here reads or writes Project 1.
--
-- Access: tables are not open to the Data API by default (the project was made with "expose new tables" off and automatic
-- RLS on). Each table is granted to signed-in users only, and row rules decide by role:
--   owner      everything
--   office     everything except staff
--   warehouse  materials, suppliers (and later purchases, invoices)
--   manager    their branch (later: receiving, counts, sales)
--   cashier    their branch's POS (later)
-- A person gets a role only by a row in public.staff, which only the owner can write.

create schema if not exists private;

create table public.branches (
  id text primary key check (id ~ '^[a-z][a-z0-9-]{1,30}$'),
  name text not null check (char_length(name) between 1 and 60),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  role text not null check (role in ('owner', 'office', 'warehouse', 'manager', 'cashier')),
  branch_id text references public.branches (id), -- managers and cashiers work at one branch
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (role not in ('manager', 'cashier') or branch_id is not null)
);

-- raw materials, counted in a base unit; bought in packs (1 bag = 1,000 g)
create table public.materials (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 80),
  unit text not null check (unit in ('g', 'ml', 'pc')),
  pack_name text check (char_length(pack_name) <= 40), -- e.g. "bag", "carton"
  pack_size numeric(12, 3) check (pack_size > 0), -- base units in one pack
  cost numeric(14, 4) not null default 0 check (cost >= 0), -- IQD per base unit, the latest purchase price
  min_stock numeric(14, 3) not null default 0 check (min_stock >= 0), -- warn below this
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 80),
  phone text check (char_length(phone) <= 30),
  notes text check (char_length(notes) <= 400),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function private.touch() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
create trigger materials_touch before update on public.materials for each row execute function private.touch();
create trigger suppliers_touch before update on public.suppliers for each row execute function private.touch();

-- the caller's role and branch (null when not active staff)
create or replace function private.my_role() returns text language sql stable security definer set search_path = '' as $$
  select role from public.staff where user_id = auth.uid() and active
$$;
create or replace function private.my_branch() returns text language sql stable security definer set search_path = '' as $$
  select branch_id from public.staff where user_id = auth.uid() and active
$$;
revoke all on function private.my_role(), private.my_branch() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.my_role(), private.my_branch() to authenticated;

alter table public.branches enable row level security;
alter table public.staff enable row level security;
alter table public.materials enable row level security;
alter table public.suppliers enable row level security;

grant select on public.branches, public.materials, public.suppliers to authenticated;
grant select, insert, update on public.staff to authenticated;
grant insert, update on public.branches to authenticated;
grant insert, update on public.materials, public.suppliers to authenticated;

-- any active staff member may read branches, materials and suppliers
create policy "staff read branches" on public.branches for select to authenticated using (private.my_role() is not null);
create policy "staff read materials" on public.materials for select to authenticated using (private.my_role() is not null);
create policy "staff read suppliers" on public.suppliers for select to authenticated using (private.my_role() is not null);

-- the owner sets up branches; owner, office and warehouse keep materials and suppliers
create policy "owner writes branches" on public.branches for insert to authenticated with check (private.my_role() = 'owner');
create policy "owner edits branches" on public.branches for update to authenticated using (private.my_role() = 'owner') with check (private.my_role() = 'owner');
create policy "keepers add materials" on public.materials for insert to authenticated with check (private.my_role() in ('owner', 'office', 'warehouse'));
create policy "keepers edit materials" on public.materials for update to authenticated using (private.my_role() in ('owner', 'office', 'warehouse')) with check (private.my_role() in ('owner', 'office', 'warehouse'));
create policy "keepers add suppliers" on public.suppliers for insert to authenticated with check (private.my_role() in ('owner', 'office', 'warehouse'));
create policy "keepers edit suppliers" on public.suppliers for update to authenticated using (private.my_role() in ('owner', 'office', 'warehouse')) with check (private.my_role() in ('owner', 'office', 'warehouse'));

-- everyone sees their own staff row; owner and office see all; only the owner adds or changes staff
create policy "see own staff row" on public.staff for select to authenticated using (user_id = auth.uid() or private.my_role() in ('owner', 'office'));
create policy "owner adds staff" on public.staff for insert to authenticated with check (private.my_role() = 'owner');
create policy "owner edits staff" on public.staff for update to authenticated using (private.my_role() = 'owner') with check (private.my_role() = 'owner');

-- nothing is ever deleted from these tables: things are switched off (active = false), so history stays whole
insert into public.branches (id, name) values ('erbil', 'Erbil'), ('kirkuk', 'Kirkuk');
