-- Persistent exercise substitution reliability smoke.
-- Verifies current-workout replacement + one preference row + next-workout snapshot.
-- All mutations are rolled back.

begin;

do $$
declare
  v_client uuid;
  v_day uuid;
  v_program_exercise uuid;
  v_default uuid;
  v_alt uuid;
  v_first_workout uuid;
  v_first_workout_exercise uuid;
  v_replace_one uuid;
  v_replace_two uuid;
  v_second_workout uuid;
  v_second_workout_exercise uuid;
  v_count integer;
begin
  select tp.client_id,td.id,pe.id,pe.default_exercise_id,
    (
      select alt.id
      from public.exercise_substitution_members m
      join public.exercises alt on alt.id=m.exercise_id and alt.is_active=true
      left join public.exercise_substitution_groups g on g.id=pe.substitution_group_id
      where alt.id<>pe.default_exercise_id
        and (
          (pe.substitution_policy='strict' and m.group_id=pe.substitution_group_id and m.match_type='direct')
          or
          (pe.substitution_policy='flexible' and m.group_id=pe.substitution_group_id and m.match_type in ('direct','acceptable'))
          or
          (pe.substitution_policy='wide' and (m.group_id=pe.substitution_group_id or (g.parent_group_id is not null and m.group_id=g.parent_group_id)))
        )
      order by m.priority,alt.name
      limit 1
    )
  into v_client,v_day,v_program_exercise,v_default,v_alt
  from public.training_programs tp
  join public.training_days td on td.program_id=tp.id
  join public.program_exercises pe on pe.training_day_id=td.id
  where tp.status='active'
    and tp.is_active=true
    and tp.client_id is not null
    and pe.allow_client_substitution=true
    and pe.substitution_group_id is not null
  order by tp.updated_at desc,td.day_index,pe.sort_order
  limit 1;

  if v_client is null or v_alt is null then
    raise exception 'QA persistent substitution smoke requires an active client program with an allowed alternative';
  end if;

  -- Avoid an existing real in-progress session causing start_workout to return it.
  update public.workout_sessions
  set status='completed',completed_at=coalesce(completed_at,now()),updated_at=now()
  where client_id=v_client and status='in_progress';

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',v_client,'role','authenticated')::text,
    true
  );
  set local role authenticated;

  select public.start_workout(v_day) into v_first_workout;

  select we.id into v_first_workout_exercise
  from public.workout_exercises we
  where we.workout_session_id=v_first_workout
    and we.program_exercise_id=v_program_exercise;

  if v_first_workout_exercise is null then
    raise exception 'First workout did not contain the source program exercise';
  end if;

  select public.replace_workout_exercise_v2(v_first_workout_exercise,v_alt,true) into v_replace_one;
  select public.replace_workout_exercise_v2(v_first_workout_exercise,v_alt,true) into v_replace_two;

  if v_replace_two is distinct from v_replace_one then
    raise exception 'Repeated persistent replacement returned a different workout exercise';
  end if;

  select count(*) into v_count
  from public.client_program_exercise_preferences p
  where p.client_id=v_client
    and p.program_exercise_id=v_program_exercise
    and p.preferred_exercise_id=v_alt;

  if v_count<>1 then
    raise exception 'Expected exactly one persistent preference, got %',v_count;
  end if;

  reset role;

  update public.workout_sessions
  set status='completed',completed_at=coalesce(completed_at,now()),updated_at=now()
  where id=v_first_workout;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',v_client,'role','authenticated')::text,
    true
  );
  set local role authenticated;

  select public.start_workout(v_day) into v_second_workout;

  select we.id into v_second_workout_exercise
  from public.workout_exercises we
  where we.workout_session_id=v_second_workout
    and we.program_exercise_id=v_program_exercise
    and we.exercise_id=v_alt
    and we.prescribed_exercise_id=v_default
    and we.substituted_from_exercise_id=v_default;

  if v_second_workout_exercise is null then
    raise exception 'Next workout did not apply persistent replacement while preserving prescribed snapshot';
  end if;

  reset role;
end $$;

rollback;
