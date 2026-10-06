do $$
begin
  if not exists(
    select 1 from pg_constraint
    where conrelid='public.workout_sets'::regclass
      and conname='workout_sets_completed_reps_positive'
  ) then
    alter table public.workout_sets
      add constraint workout_sets_completed_reps_positive
      check (completed_at is null or (reps is not null and reps>0));
  end if;

  if not exists(
    select 1 from pg_constraint
    where conrelid='public.workout_sets'::regclass
      and conname='workout_sets_warmup_number_consistency'
  ) then
    alter table public.workout_sets
      add constraint workout_sets_warmup_number_consistency
      check ((is_warmup and set_number=0) or (not is_warmup and set_number>0));
  end if;

  if not exists(
    select 1 from pg_constraint
    where conrelid='public.workout_cardio_entries'::regclass
      and conname='workout_cardio_completed_duration_valid'
  ) then
    alter table public.workout_cardio_entries
      add constraint workout_cardio_completed_duration_valid
      check (completed_at is null or (actual_duration_minutes is not null and actual_duration_minutes between 1 and 600));
  end if;
end $$;
