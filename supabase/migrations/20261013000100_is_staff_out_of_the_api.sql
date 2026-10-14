-- The staff check is only for the row rules; it should not be callable as an API function
-- (Supabase's security advisor flags a SECURITY DEFINER function that signed-in users can call over the API).
-- A schema the Data API does not expose keeps it out of /rest/v1/rpc. The policies follow the function by itself.
create schema if not exists private;
grant usage on schema private to authenticated;
alter function public.is_staff(text) set schema private;
revoke all on function private.is_staff(text) from public, anon;
grant execute on function private.is_staff(text) to authenticated;
