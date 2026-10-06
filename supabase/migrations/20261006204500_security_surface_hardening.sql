-- Reduce authenticated RPC surface and remove a redundant workout uniqueness index.
-- The application uses the idempotent v2 feedback RPCs; the legacy wrappers are intentionally disabled.

revoke all on function public.add_workout_comment(uuid,text) from public,anon,authenticated;
revoke all on function public.reply_to_feedback(uuid,text) from public,anon,authenticated;

-- Identical to workout_sessions_one_active_per_client_uq; one unique partial index is sufficient.
drop index if exists public.workout_sessions_one_in_progress_per_client;
