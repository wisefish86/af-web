-- Prevent workout substitution from re-attributing already saved results
-- and refresh exercise snapshots when a substitution is performed.

create or replace function public.replace_workout_exercise(
  p_workout_exercise_id uuid,
  p_new_exercise_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_current uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select we.exercise_id
  into v_current
  from public.workout_exercises we
  join public.workout_sessions ws on ws.id=we.workout_session_id
  where we.id=p_workout_exercise_id
    and ws.client_id=(select auth.uid())
    and ws.status='in_progress'
    and we.allow_substitution=true
    and we.completed_at is null
  for update of ws,we;

  if not found then
    raise exception 'Substitution is not allowed for this exercise';
  end if;

  if exists(
    select 1
    from public.workout_sets s
    where s.workout_exercise_id=p_workout_exercise_id
  ) then
    raise exception 'Exercise cannot be substituted after a set has been saved';
  end if;

  if not exists (
    select 1
    from public.get_allowed_workout_substitutions(p_workout_exercise_id) s
    where s.exercise_id=p_new_exercise_id
  ) then
    raise exception 'Exercise is not allowed by the substitution policy';
  end if;

  update public.workout_exercises we
  set exercise_id=e.id,
      substituted_from_exercise_id=coalesce(we.substituted_from_exercise_id,v_current),
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
end;
$$;

revoke all on function public.replace_workout_exercise(uuid,uuid) from public,anon;
grant execute on function public.replace_workout_exercise(uuid,uuid) to authenticated;
