-- Reassert SECURITY DEFINER after 20261009170000 replaced reopen_my_workout.
-- Authenticated users no longer have direct UPDATE privileges on workout_sessions,
-- so the RPC must execute with controlled elevated rights and its own auth.uid() ownership checks.

alter function public.reopen_my_workout(uuid) security definer;
alter function public.reopen_my_workout(uuid) set search_path to pg_catalog, public;

revoke all on function public.reopen_my_workout(uuid) from public, anon;
grant execute on function public.reopen_my_workout(uuid) to authenticated;
