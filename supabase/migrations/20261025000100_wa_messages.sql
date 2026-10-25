-- WhatsApp messages sent to drivers, and what became of them (owner, 2026-10-25: "i need wa msgs log to see what's
-- delivered, what's read, what's failed"). send-whatsapp adds a row for every send (with Meta's message id, or the
-- refusal); wa-webhook moves it on as Meta reports sent → delivered → read, or failed with the reason. Both write with
-- the service role; staff only read their branch's rows (the owner: every branch).
create table if not exists public.wa_messages (
  id bigint generated always as identity primary key,
  wamid text unique,                                   -- Meta's message id; null when Meta refused it at once
  order_uid uuid references public.orders (uid) on delete set null,
  order_code text not null default '',
  branch text not null default '',
  to_number text not null,                             -- as sent: 9647501234567
  driver text not null default '',                     -- the name on the dashboard's button
  template text not null default '',                   -- 'mars_order_loc/fa', or 'text' for the plain message
  status text not null default 'sent' check (status in ('sent', 'delivered', 'read', 'failed')),
  error text,                                          -- Meta's reason when failed
  sent_by uuid,                                        -- the staff member who pressed the button
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz
);
create index if not exists wa_messages_branch on public.wa_messages (branch, created_at desc);
alter table public.wa_messages enable row level security;

drop policy if exists "staff read their branch's whatsapp log" on public.wa_messages;
create policy "staff read their branch's whatsapp log" on public.wa_messages for select to authenticated
  using ((select private.is_staff(branch)));

revoke all on public.wa_messages from anon, authenticated;
grant select on public.wa_messages to authenticated;
