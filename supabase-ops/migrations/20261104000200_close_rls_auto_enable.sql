-- Supabase's own "automatic RLS" event-trigger function (made because the project was created with that option on) sits in
-- public and was callable by anon / authenticated (security advisor 0028 / 0029). It returns event_trigger, so a direct call
-- fails anyway; closing it silences the warning. Event triggers do not check EXECUTE, so new tables still get RLS.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
