revoke insert,update,delete on table public.workout_sessions from authenticated,anon;
revoke insert,update,delete on table public.workout_exercises from authenticated,anon;
revoke insert,update,delete on table public.workout_sets from authenticated,anon;
revoke insert,update,delete on table public.workout_cardio_entries from authenticated,anon;

revoke all on function public.complete_workout(uuid,text) from public,anon,authenticated;
revoke all on function public.auto_complete_stale_workout(uuid) from public,anon,authenticated;

revoke all on function public.guard_completed_workout_child() from public,anon,authenticated;
revoke all on function public.guard_completed_workout_session() from public,anon,authenticated;
revoke all on function public.snapshot_workout_exercise_warmup() from public,anon,authenticated;
