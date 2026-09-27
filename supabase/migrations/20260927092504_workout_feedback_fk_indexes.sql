
create index if not exists feedback_messages_author_idx
  on public.feedback_messages(author_id);

create index if not exists feedback_threads_created_by_idx
  on public.feedback_threads(created_by);

create index if not exists feedback_threads_workout_session_idx
  on public.feedback_threads(workout_session_id);

create index if not exists workout_cardio_modality_idx
  on public.workout_cardio_entries(modality_code);

create index if not exists workout_cardio_program_block_idx
  on public.workout_cardio_entries(program_cardio_block_id);

create index if not exists workout_exercises_substituted_from_idx
  on public.workout_exercises(substituted_from_exercise_id);
