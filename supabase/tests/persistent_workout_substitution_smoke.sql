-- Persistent workout substitution preference smoke. All changes are rolled back.

begin;

do $$
declare
  v_client uuid;
  v_day uuid;
  v_program uuid;
  v_program_exercise uuid;
  v_default_exercise uuid;
  v_alternative uuid;
  v_group uuid;
  v_policy text;
  v_default_name text;
  v_session_one uuid;
  v_session_two uuid;
  v_session_three uuid;
  v_workout_exercise_one uuid;
  v_workout_exercise_two uuid;
  v_workout_exercise_three uuid;
  v_result uuid;
begin
  select tp.client_id,td.id,tp.id,pe.id,pe.default_exercise_id,
         alt.exercise_id,pe.substitution_group_id,pe.substitution_policy,e.name
  into v_client,v_day,v_program,v_program_exercise,v_default_exercise,
       v_alternative,v_group,v_policy,v_default_name
  from public.training_programs tp
  join public.training_days td on td.program_id=tp.id
  join public.program_exercises pe on pe.training_day_id=td.id
  join public.exercises e on e.id=pe.default_exercise_id and e.is_active=true
  join lateral(
    select esm.exercise_id
    from public.exercise_substitution_members esm
    join public.exercises candidate on candidate.id=esm.exercise_id and candidate.is_active=true
    left join public.exercise_substitution_groups g on g.id=pe.substitution_group_id
    where esm.exercise_id<>pe.default_exercise_id
      and (
        (pe.substitution_policy='strict' and esm.group_id=pe.substitution_group_id and esm.match_type='direct')
        or
        (pe.substitution_policy='flexible' and esm.group_id=pe.substitution_group_id and esm.match_type in ('direct','acceptable'))
        or
        (pe.substitution_policy='wide' and (esm.group_id=pe.substitution_group_id or (g.parent_group_id is not null and esm.group_id=g.parent_group_id)))
      )
    order by esm.priority
    limit 1
  ) alt on true
  where tp.status='active'
    and tp.client_id is not null
    and pe.allow_client_substitution=true
    and pe.substitution_group_id is not null
  order by tp.created_at,td.day_index,pe.sort_order
  limit 1;

  if v_client is null or v_alternative is null then
    raise exception 'QA persistent substitution smoke requires an active client program with one allowed replacement';
  end if;

  delete from public.client_program_exercise_preferences
  where client_id=v_client and program_exercise_id=v_program_exercise;

  update public.workout_sessions
  set status='abandoned',completed_at=coalesce(completed_at,now()),updated_at=now()
  where client_id=v_client and status='in_progress';

  insert into public.workout_sessions(
    client_id,training_day_id,program_id,status,started_at,updated_at
  ) values(v_client,v_day,v_program,'in_progress',now(),now())
  returning id into v_session_one;

  insert into public.workout_exercises(
    workout_session_id,program_exercise_id,exercise_id,prescribed_exercise_id,
    prescribed_exercise_name_snapshot,exercise_name_snapshot,
    allow_substitution,substitution_group_id,substitution_policy,prescribed_sets,sort_order
  ) values(
    v_session_one,v_program_exercise,v_default_exercise,v_default_exercise,
    v_default_name,v_default_name,true,v_group,v_policy,3,10
  )
  returning id into v_workout_exercise_one;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',v_client,'role','authenticated')::text,
    true
  );
  set local role authenticated;

  select public.replace_workout_exercise_v2(
    v_workout_exercise_one,v_alternative,true
  ) into v_result;

  if v_result<>v_workout_exercise_one then
    raise exception 'Pre-set persistent substitution unexpectedly created a continuation';
  end if;

  if not exists(
    select 1
    from public.client_program_exercise_preferences p
    where p.client_id=v_client
      and p.program_exercise_id=v_program_exercise
      and p.preferred_exercise_id=v_alternative
  ) then
    raise exception 'Persistent substitution preference was not stored';
  end if;

  -- Same request/result is retry-safe and does not duplicate the preference.
  perform public.replace_workout_exercise_v2(v_workout_exercise_one,v_alternative,true);

  if (
    select count(*)
    from public.client_program_exercise_preferences p
    where p.client_id=v_client and p.program_exercise_id=v_program_exercise
  )<>1 then
    raise exception 'Persistent substitution retry created duplicate preference rows';
  end if;

  reset role;

  update public.workout_sessions
  set status='abandoned',completed_at=now(),updated_at=now()
  where id=v_session_one;

  insert into public.workout_sessions(
    client_id,training_day_id,program_id,status,started_at,updated_at
  ) values(v_client,v_day,v_program,'in_progress',now(),now())
  returning id into v_session_two;

  insert into public.workout_exercises(
    workout_session_id,program_exercise_id,exercise_id,prescribed_exercise_id,
    prescribed_exercise_name_snapshot,exercise_name_snapshot,
    allow_substitution,substitution_group_id,substitution_policy,prescribed_sets,sort_order
  ) values(
    v_session_two,v_program_exercise,v_default_exercise,v_default_exercise,
    v_default_name,v_default_name,true,v_group,v_policy,3,10
  )
  returning id into v_workout_exercise_two;

  if not exists(
    select 1
    from public.workout_exercises we
    where we.id=v_workout_exercise_two
      and we.exercise_id=v_alternative
      and we.prescribed_exercise_id=v_default_exercise
      and we.substituted_from_exercise_id=v_default_exercise
  ) then
    raise exception 'Future workout did not apply the stored substitution preference';
  end if;

  -- The prescribed/original exercise must remain selectable so the client can
  -- explicitly clear a persistent preference.
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',v_client,'role','authenticated')::text,
    true
  );
  set local role authenticated;

  if not exists(
    select 1
    from public.get_allowed_workout_substitutions(v_workout_exercise_two) s
    where s.exercise_id=v_default_exercise
  ) then
    raise exception 'Prescribed exercise is not available as a reset option';
  end if;

  perform public.replace_workout_exercise_v2(
    v_workout_exercise_two,v_default_exercise,true
  );

  if exists(
    select 1
    from public.client_program_exercise_preferences p
    where p.client_id=v_client and p.program_exercise_id=v_program_exercise
  ) then
    raise exception 'Choosing the prescribed exercise permanently did not clear the preference';
  end if;

  reset role;

  update public.workout_sessions
  set status='abandoned',completed_at=now(),updated_at=now()
  where id=v_session_two;

  insert into public.workout_sessions(
    client_id,training_day_id,program_id,status,started_at,updated_at
  ) values(v_client,v_day,v_program,'in_progress',now(),now())
  returning id into v_session_three;

  insert into public.workout_exercises(
    workout_session_id,program_exercise_id,exercise_id,prescribed_exercise_id,
    prescribed_exercise_name_snapshot,exercise_name_snapshot,
    allow_substitution,substitution_group_id,substitution_policy,prescribed_sets,sort_order
  ) values(
    v_session_three,v_program_exercise,v_default_exercise,v_default_exercise,
    v_default_name,v_default_name,true,v_group,v_policy,3,10
  )
  returning id into v_workout_exercise_three;

  if not exists(
    select 1
    from public.workout_exercises we
    where we.id=v_workout_exercise_three
      and we.exercise_id=v_default_exercise
      and we.substituted_from_exercise_id is null
  ) then
    raise exception 'Cleared persistent preference still affected a future workout';
  end if;
end $$;

rollback;
