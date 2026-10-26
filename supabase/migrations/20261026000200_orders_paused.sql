-- A branch can pause new orders (owner, 2026-10-26: "stop receiving orders, with an apology message"): Dashboard → Tools
-- → Pause orders sets branch_config.settings.paused. The website stops offering the checkout; this refuses an order that
-- still arrives (from a page that had not heard yet) with P0010, which the page shows as cancelled ("not taking orders").
create or replace function private.orders_paused()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.branch_config b where b.branch = new.branch and coalesce((b.settings->>'paused')::boolean, false)) then
    raise exception 'This branch is not taking orders right now.' using errcode = 'P0010';
  end if;
  return new;
end;
$$;
revoke all on function private.orders_paused() from public, anon, authenticated;
drop trigger if exists orders_paused on public.orders;
create trigger orders_paused before insert on public.orders
  for each row execute function private.orders_paused();
