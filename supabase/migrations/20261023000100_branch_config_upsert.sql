-- The dashboard's saves of a branch's settings and offers were all refused (found 2026-10-23: the owner turned on the
-- Positive Hours service fee and customers never got it). The dashboard saves with an upsert, and an upsert updates
-- every column it sends, branch included; staff could update only settings and offers, so the whole save failed with
-- "permission denied" and the change stayed on that device. Staff may now name the branch in an update, and the
-- trigger keeps the branch as it was, so a branch can still never be renamed this way.
grant update (branch) on public.branch_config to authenticated;

create or replace function public.branch_config_stamp()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then new.branch := old.branch; end if;
  new.updated_at := now();
  return new;
end;
$$;
