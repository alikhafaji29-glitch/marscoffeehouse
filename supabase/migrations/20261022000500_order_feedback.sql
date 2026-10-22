-- Customers' feedback (owner, 2026-10-22: "feedback if the order was cancelled by staff, and feedback after receiving
-- the order, put some options to pick from"). One row per order and kind:
--   received:  after the order reached its last stage; a rating 1-5, tapped options, an optional comment
--   cancelled: after staff cancelled it; tapped options, an optional comment
-- The customer who placed the order writes it (the order's Supabase or Clerk owner); the branch's staff read it. The
-- branch is copied from the order by the database, never sent by the page.
create table if not exists public.order_feedback (
  id bigint generated always as identity primary key,
  order_uid uuid not null references public.orders (uid) on delete cascade,
  branch text not null default '',
  kind text not null check (kind in ('received', 'cancelled')),
  rating smallint check (rating between 1 and 5),
  tags text[] not null default '{}' check (cardinality(tags) <= 12),
  comment text check (char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  unique (order_uid, kind)
);
create index if not exists order_feedback_branch on public.order_feedback (branch, created_at desc);
alter table public.order_feedback enable row level security;

create or replace function public.order_feedback_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.branch := (select o.branch from public.orders o where o.uid = new.order_uid);
  new.created_at := now();
  return new;
end;
$$;
revoke all on function public.order_feedback_before_insert() from public, anon, authenticated;
drop trigger if exists order_feedback_before_insert on public.order_feedback;
create trigger order_feedback_before_insert before insert on public.order_feedback
  for each row execute function public.order_feedback_before_insert();

drop policy if exists "customers give feedback on their own orders" on public.order_feedback;
create policy "customers give feedback on their own orders" on public.order_feedback for insert to authenticated
  with check (exists (select 1 from public.orders o where o.uid = order_uid
    and (o.customer_id = (select private.my_uuid()) or o.clerk_id = (select private.clerk_id()))));
drop policy if exists "staff read their branch's feedback" on public.order_feedback;
create policy "staff read their branch's feedback" on public.order_feedback for select to authenticated
  using ((select private.is_staff(branch)));

revoke all on public.order_feedback from anon, authenticated;
grant select on public.order_feedback to authenticated;
grant insert (order_uid, kind, rating, tags, comment) on public.order_feedback to authenticated;
