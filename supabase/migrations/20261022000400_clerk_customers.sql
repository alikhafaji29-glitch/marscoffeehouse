-- Customers who sign in with Clerk (owner, 2026-10-22: Clerk for clients; Supabase → Third-party auth → Clerk).
-- A Clerk session token's `sub` is Clerk's user id ("user_…"), not a Supabase uuid, and `auth.uid()` casts `sub` to a
-- uuid: every rule that called it would fail for a Clerk customer. So:
--   private.my_uuid()  the Supabase user's id (staff, anonymous guests), null for a Clerk customer
--   private.clerk_id() the Clerk user's id, null for a Supabase user
-- Staff and guests behave exactly as before (my_uuid() = auth.uid() for them). An order now belongs to a Supabase
-- identity (customer_id, as before) or to a Clerk user (clerk_id): the customer sees it on any device signed in to
-- that Clerk account.
create or replace function private.my_uuid()
returns uuid language sql stable set search_path = '' as $$
  select case when (auth.jwt() ->> 'sub') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then (auth.jwt() ->> 'sub')::uuid end;
$$;
create or replace function private.clerk_id()
returns text language sql stable set search_path = '' as $$
  select case when (auth.jwt() ->> 'sub') like 'user\_%' then auth.jwt() ->> 'sub' end;
$$;
revoke all on function private.my_uuid() from public, anon;
revoke all on function private.clerk_id() from public, anon;
grant execute on function private.my_uuid() to authenticated;
grant execute on function private.clerk_id() to authenticated;

-- staff checks: by the Supabase id (a Clerk customer is never staff)
create or replace function private.is_staff(for_branch text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff s where s.user_id = (select private.my_uuid()) and (s.branch is null or s.branch = for_branch));
$$;
create or replace function private.is_manager(for_branch text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff s where s.user_id = (select private.my_uuid()) and s.role = 'manager' and (s.branch is null or s.branch = for_branch));
$$;
create or replace function private.is_owner()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff s where s.user_id = (select private.my_uuid()) and s.branch is null);
$$;
drop policy if exists "staff read their own row" on public.staff;
create policy "staff read their own row" on public.staff for select to authenticated using (user_id = (select private.my_uuid()));

-- orders: a Supabase owner (customer_id) or a Clerk owner (clerk_id), filled by the database, never by the page
alter table public.orders add column if not exists clerk_id text;
alter table public.orders alter column customer_id drop not null;
alter table public.orders alter column customer_id set default private.my_uuid();
alter table public.orders alter column clerk_id set default private.clerk_id();
alter table public.orders drop constraint if exists orders_owner_check;
alter table public.orders add constraint orders_owner_check check (customer_id is not null or clerk_id is not null);
create index if not exists orders_clerk on public.orders (clerk_id, created_at desc) where clerk_id is not null;

drop policy if exists "customers place their own orders" on public.orders;
create policy "customers place their own orders" on public.orders for insert to authenticated
  with check (customer_id = (select private.my_uuid()) or (customer_id is null and clerk_id = (select private.clerk_id())));
drop policy if exists "customers read their own orders, staff their branch" on public.orders;
create policy "customers read their own orders, staff their branch" on public.orders for select to authenticated
  using (customer_id = (select private.my_uuid()) or clerk_id = (select private.clerk_id()) or (select private.is_staff(branch)));

-- at most 10 orders an hour from one customer, Supabase or Clerk
create or replace function public.orders_before_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.orders o
        where (o.customer_id = new.customer_id or o.clerk_id = new.clerk_id) and o.created_at > now() - interval '1 hour') >= 10 then
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
