-- Allow a client to change equipment/exercise mid-workout without destroying
-- already completed sets. Before the first saved set, substitution still replaces
-- the row in place. After saved results, the old exercise is completed and a new
-- continuation row receives only the remaining prescribed work sets.

alter table public.workout_exercises
  add column if not exists continued_from_workout_exercise_id uuid
  references public.workout_exercises(id) on delete set null;

create unique index if not exists workout_exercises_one_continuation_per_source_uq
  on public.workout_exercises(continued_from_workout_exercise_id)
  where continued_from_workout_exercise_id is not null;

create or replace function public.replace_workout_exercise(
  p_workout_exercise_id uuid,
  p_new_exercise_id uuid
)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  v_user uuid:=auth.uid();
  v_source public.workout_exercises%rowtype;
  v_existing uuid;
  v_new uuid;
  v_completed_work_sets integer:=0;
  v_open_saved_sets integer:=0;
  v_total_sets integer:=0;
  v_remaining_sets integer:=0;
  v_completed_at timestamptz:=now();
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  -- Retry-safe continuation: a lost response must not create a second exercise.
  select c.id into v_existing
  from public.workout_exercises c
  join public.workout_exercises src on src.id=c.continued_from_workout_exercise_id
  join public.workout_sessions ws on ws.id=src.workout_session_id
  where src.id=p_workout_exercise_id
    and ws.client_id=v_user
    and c.exercise_id=p_new_exercise_id
  limit 1;
  if v_existing is not null then return v_existing; end if;

  select we.* into v_source
  from public.workout_exercises we
  join public.workout_sessions ws on ws.id=we.workout_session_id
  where we.id=p_workout_exercise_id
    and ws.client_id=v_user
    and ws.status='in_progress'
    and we.allow_substitution=true
    and we.completed_at is null
  for update of ws,we;

  if not found then
    raise exception 'Substitution is not allowed for this exercise';
  end if;

  -- Retry-safe in-place substitution.
  if v_source.exercise_id=p_new_exercise_id then
    return p_workout_exercise_id;
  end if;

  if not exists (
    select 1
    from public.get_allowed_workout_substitutions(p_workout_exercise_id) s
    where s.exercise_id=p_new_exercise_id
  ) then
    raise exception 'Exercise is not allowed by the substitution policy';
  end if;

  select
    count(*) filter(where not s.is_warmup and s.completed_at is not null),
    count(*) filter(where s.completed_at is null)
  into v_completed_work_sets,v_open_saved_sets
  from public.workout_sets s
  where s.workout_exercise_id=p_workout_exercise_id;

  -- No saved result yet: preserve the existing fast in-place replacement.
  if not exists(
    select 1 from public.workout_sets s
    where s.workout_exercise_id=p_workout_exercise_id
  ) then
    update public.workout_exercises we
    set exercise_id=e.id,
        substituted_from_exercise_id=coalesce(we.substituted_from_exercise_id,v_source.exercise_id),
        exercise_name_snapshot=e.name,
        instructions_snapshot=e.instructions,
        technique_url_snapshot=e.technique_url,
        primary_muscle_snapshot=(
          select emg.muscle_group_code
          from public.exercise_muscle_groups emg
          where emg.exercise_id=e.id and emg.role='primary'
          order by emg.muscle_group_code
          limit 1
        ),
        image_storage_path_snapshot=(
          select m.storage_path
          from public.exercise_media m
          where m.exercise_id=e.id and m.kind='image'
          order by m.sort_order,m.created_at
          limit 1
        ),
        image_external_url_snapshot=(
          select m.external_url
          from public.exercise_media m
          where m.exercise_id=e.id and m.kind='image'
          order by m.sort_order,m.created_at
          limit 1
        )
    from public.exercises e
    where we.id=p_workout_exercise_id
      and e.id=p_new_exercise_id;

    if not found then raise exception 'Replacement exercise not found'; end if;
    return p_workout_exercise_id;
  end if;

  if v_open_saved_sets>0 then
    raise exception 'Finish or delete the set being edited before switching exercise';
  end if;

  v_total_sets:=coalesce(v_source.prescribed_sets,3);
  v_remaining_sets:=greatest(v_total_sets-v_completed_work_sets,0);
  if v_remaining_sets<=0 then
    raise exception 'All prescribed sets are already completed';
  end if;

  if not exists(select 1 from public.exercises e where e.id=p_new_exercise_id and e.is_active=true) then
    raise exception 'Replacement exercise not found';
  end if;

  -- Make deterministic room directly after the source exercise.
  update public.workout_exercises we
  set sort_order=we.sort_order+10
  where we.workout_session_id=v_source.workout_session_id
    and we.sort_order>v_source.sort_order;

  insert into public.workout_exercises(
    workout_session_id,program_exercise_id,exercise_id,sort_order,notes,
    prescribed_sets,reps_min,reps_max,rir_min,rir_max,rir_enabled,rest_seconds,
    allow_substitution,substitution_group_id,exercise_role,trainer_notes,
    substituted_from_exercise_id,completed_at,substitution_policy,
    prescribed_exercise_id,prescribed_exercise_name_snapshot,
    exercise_name_snapshot,instructions_snapshot,technique_url_snapshot,
    primary_muscle_snapshot,image_storage_path_snapshot,image_external_url_snapshot,
    warmup_enabled,warmup_load_percent_min,warmup_load_percent_max,
    warmup_reps_min,warmup_reps_max,warmup_rest_seconds,warmup_notes,
    progression_notes_snapshot,superset_group,superset_position,
    continued_from_workout_exercise_id
  )
  select
    v_source.workout_session_id,v_source.program_exercise_id,e.id,v_source.sort_order+10,v_source.notes,
    v_remaining_sets,v_source.reps_min,v_source.reps_max,v_source.rir_min,v_source.rir_max,
    v_source.rir_enabled,v_source.rest_seconds,
    v_source.allow_substitution,v_source.substitution_group_id,v_source.exercise_role,v_source.trainer_notes,
    v_source.exercise_id,null,v_source.substitution_policy,
    v_source.prescribed_exercise_id,v_source.prescribed_exercise_name_snapshot,
    e.name,e.instructions,e.technique_url,
    (
      select emg.muscle_group_code
      from public.exercise_muscle_groups emg
      where emg.exercise_id=e.id and emg.role='primary'
      order by emg.muscle_group_code
      limit 1
    ),
    (
      select m.storage_path
      from public.exercise_media m
      where m.exercise_id=e.id and m.kind='image'
      order by m.sort_order,m.created_at
      limit 1
    ),
    (
      select m.external_url
      from public.exercise_media m
      where m.exercise_id=e.id and m.kind='image'
      order by m.sort_order,m.created_at
      limit 1
    ),
    (v_source.warmup_enabled and v_completed_work_sets=0),
    v_source.warmup_load_percent_min,v_source.warmup_load_percent_max,
    v_source.warmup_reps_min,v_source.warmup_reps_max,
    v_source.warmup_rest_seconds,v_source.warmup_notes,
    v_source.progression_notes_snapshot,v_source.superset_group,v_source.superset_position,
    v_source.id
  from public.exercises e
  where e.id=p_new_exercise_id
  returning id into v_new;

  if v_new is null then raise exception 'Replacement exercise not found'; end if;

  update public.workout_exercises
  set completed_at=v_completed_at
  where id=v_source.id and completed_at is null;

  update public.workout_sessions
  set active_workout_exercise_id=v_new,updated_at=now()
  where id=v_source.workout_session_id
    and client_id=v_user
    and status='in_progress';

  return v_new;
end;
$function$;

revoke all on function public.replace_workout_exercise(uuid,uuid) from public,anon;
grant execute on function public.replace_workout_exercise(uuid,uuid) to authenticated;
