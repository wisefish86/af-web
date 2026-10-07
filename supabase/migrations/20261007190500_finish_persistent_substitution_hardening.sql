create index if not exists client_program_exercise_preferences_program_exercise_idx
  on public.client_program_exercise_preferences(program_exercise_id);

create index if not exists client_program_exercise_preferences_preferred_exercise_idx
  on public.client_program_exercise_preferences(preferred_exercise_id);

revoke all on function public.replace_workout_exercise(uuid,uuid) from public;
revoke all on function public.replace_workout_exercise(uuid,uuid) from anon;
revoke all on function public.replace_workout_exercise(uuid,uuid) from authenticated;
