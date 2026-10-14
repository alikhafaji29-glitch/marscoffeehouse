-- Mars CoffeeHouse, step 1 of the backend: orders and live tracking.
--
-- Who can do what:
--   a customer (any signed-in visitor, including an anonymous sign-in: one private identity per phone)
--     - places an order, as "received";
--     - reads only their own orders, and so follows the stages live;
--   a staff member (a row in public.staff for their sign-in)
--     - reads the orders of their branch (branch null = every branch);
--     - changes an order's status, and nothing else about it.
--   Nobody deletes orders through the API. Visitors who are not signed in at all can do nothing.
--
-- Run once, in the Supabase SQL Editor (or through the Supabase connector / CLI). Safe to run again.

-- ---------------------------------------------------------------- staff
create table if not exists public.staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  branch text,                      -- 'erbil' | 'kirkuk'; null = all branches (owner / manager)
  name text,
  created_at timestamptz not null default now()
);
alter table public.staff enable row level security;

-- is the caller staff for this branch? (security definer: it reads public.staff past its row rules)
create or replace function public.is_staff(for_branch text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.staff s
    where s.user_id = (select auth.uid())
      and (s.branch is null or s.branch = for_branch)
  );
$$;
revoke all on function public.is_staff(text) from public, anon;
grant execute on function public.is_staff(text) to authenticated;

drop policy if exists "staff read their own row" on public.staff;
create policy "staff read their own row" on public.staff
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.staff from anon, authenticated;
grant select on public.staff to authenticated;

-- ---------------------------------------------------------------- orders
create table if not exists public.orders (
  uid uuid primary key,                                   -- made on the customer's device; the order's identity
  code text not null,                                     -- what people see and say: M123456
  created_at timestamptz not null default now(),
  customer_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  branch text not null check (branch in ('erbil', 'kirkuk')),
  status text not null default 'received' check (status in ('received', 'preparing', 'done', 'onway', 'delivered')),
  history jsonb not null default '[]'::jsonb,             -- [{ stage, at (ms) }], kept by the trigger below
  total integer not null check (total between 0 and 2000000),
  items text[] not null check (cardinality(items) between 1 and 40),
  pay text not null check (pay in ('wallet', 'pickup')),
  fulfil text not null check (fulfil in ('pickup', 'delivery')),
  customer_name text check (char_length(customer_name) <= 80),
  customer_phone text check (char_length(customer_phone) <= 30),
  delivery_phone text check (char_length(delivery_phone) <= 30),
  address text check (char_length(address) <= 400),
  location jsonb,                                         -- { lat, lng, acc } from "Share my location"
  gift_to text check (char_length(gift_to) <= 30),
  offer jsonb,                                            -- { name, price, fee?, pre? } for a combo
  points integer not null default 0 check (points between 0 and 100000)
);
create index if not exists orders_branch_created on public.orders (branch, created_at desc);
create index if not exists orders_customer on public.orders (customer_id, created_at desc);
alter table public.orders enable row level security;

-- a new order always starts as "received" with its first history line; a status change adds a line;
-- a customer cannot flood the counter (at most 10 orders an hour from one identity)
create or replace function public.orders_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.orders o
        where o.customer_id = new.customer_id and o.created_at > now() - interval '1 hour') >= 10 then
      raise exception 'Too many orders in a short time. Please call the branch.' using errcode = 'P0001';
    end if;
    new.status := 'received';
    new.created_at := now();
    new.history := jsonb_build_array(jsonb_build_object('stage', 'received', 'at', now_ms));
  elsif new.status is distinct from old.status then
    new.history := old.history || jsonb_build_object('stage', new.status, 'at', now_ms);
  end if;
  return new;
end;
$$;
revoke all on function public.orders_before_write() from public, anon, authenticated;

drop trigger if exists orders_before_write on public.orders;
create trigger orders_before_write
  before insert or update on public.orders
  for each row execute function public.orders_before_write();

drop policy if exists "customers read their own orders, staff their branch" on public.orders;
create policy "customers read their own orders, staff their branch" on public.orders
  for select to authenticated
  using (customer_id = (select auth.uid()) or (select public.is_staff(branch)));

drop policy if exists "customers place their own orders" on public.orders;
create policy "customers place their own orders" on public.orders
  for insert to authenticated
  with check (customer_id = (select auth.uid()));

drop policy if exists "staff move their branch's orders" on public.orders;
create policy "staff move their branch's orders" on public.orders
  for update to authenticated
  using ((select public.is_staff(branch)))
  with check ((select public.is_staff(branch)));

-- column by column: a customer writes the order's content and nothing else; staff change the status only
revoke all on public.orders from anon, authenticated;
grant select on public.orders to authenticated;
grant insert (uid, code, branch, total, items, pay, fulfil, customer_name, customer_phone, delivery_phone,
              address, location, gift_to, offer, points) on public.orders to authenticated;
grant update (status) on public.orders to authenticated;

-- live updates: the staff dashboard hears new orders, the customer's tracker hears the stage changes
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders') then
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;

-- ---------------------------------------------------------------- adding a staff member (for the owner)
-- 1. Dashboard: Authentication, Users, "Add user": an email and a password for the cashier.
-- 2. SQL Editor, with that email and the branch ('erbil', 'kirkuk', or null for all branches):
--
--   insert into public.staff (user_id, branch, name)
--   select id, 'erbil', 'Erbil cashier' from auth.users where email = 'cashier@example.com'
--   on conflict (user_id) do update set branch = excluded.branch, name = excluded.name;
