-- Transactional workout substitution/switch integrity smoke. All rows are rolled back.

begin;

do $$
declare
  v_client uuid;
  v_group uuid;
  v_old_exercise uuid;
  v_new_exercise uuid;
  v_session uuid;
  v_workout_exercise uuid;
  v_continuation uuid;
  v_retry uuid;
  v_new_name text;
begin
  select p.id into v_client
  from public.profiles p
  where p.role='client'
  order by p.created_at
  limit 1;

  select m1.group_id,m1.exercise_id,m2.exercise_id,e2.name
  into v_group,v_old_exercise,v_new_exercise,v_new_name
  from public.exercise_substitution_members m1
  join public.exercise_substitution_members m2
    on m2.group_id=m1.group_id
   and m2.exercise_id<>m1.exercise_id
   and m2.match_type='direct'
  join public.exercises e1 on e1.id=m1.exercise_id and e1.is_active=true
  join public.exercises e2 on e2.id=m2.exercise_id and e2.is_active=true
  where m1.match_type='direct'
  order by m1.group_id,m1.priority,m2.priority
  limit 1;

  if v_client is null or v_group is null then
    raise exception 'QA substitution smoke requires one client and one direct substitution pair';
  end if;

  update public.workout_sessions
  set status='abandoned',completed_at=coalesce(completed_at,now()),updated_at=now()
  where client_id=v_client and status='in_progress';

  insert into public.workout_sessions(client_id,status,started_at,updated_at)
  values(v_client,'in_progress',now(),now())
  returning id into v_session;

  insert into public.workout_exercises(
    workout_session_id,exercise_id,prescribed_exercise_id,
    prescribed_exercise_name_snapshot,exercise_name_snapshot,
    allow_substitution,substitution_group_id,substitution_policy,prescribed_sets,sort_order
  )
  select v_session,e.id,e.id,e.name,e.name,true,v_group,'strict',3,10
  from public.exercises e
  where e.id=v_old_exercise
  returning id into v_workout_exercise;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',v_client,'role','authenticated')::text,
    true
  );

  -- Before any saved set, replacement stays in place and refreshes snapshots.
  if public.replace_workout_exercise(v_workout_exercise,v_new_exercise)<>v_workout_exercise then
    raise exception 'Pre-set substitution unexpectedly created a continuation';
  end if;

  if not exists(
    select 1
    from public.workout_exercises
    where id=v_workout_exercise
      and exercise_id=v_new_exercise
      and exercise_name_snapshot=v_new_name
      and substituted_from_exercise_id=v_old_exercise
  ) then
    raise exception 'Replacement did not refresh exercise identity snapshots';
  end if;

  perform public.save_workout_set(v_workout_exercise,1,20,10,2,false,now());

  -- A saved set that is currently reopened for correction must be resolved first.
  perform public.reopen_my_workout_set(v_workout_exercise,1);
  begin
    perform public.replace_workout_exercise(v_workout_exercise,v_old_exercise);
    raise exception 'QA_EXPECTED_OPEN_SET_SWITCH_REJECTION_MISSING';
  exception when others then
    if sqlerrm='QA_EXPECTED_OPEN_SET_SWITCH_REJECTION_MISSING' then raise; end if;
    if position('Finish or delete the set being edited before switching exercise' in sqlerrm)=0 then
      raise;
    end if;
  end;

  perform public.save_workout_set(v_workout_exercise,1,20,10,2,false,now());

  -- After one of three work sets, switching preserves the source and creates
  -- a continuation with exactly two remaining sets.
  select public.replace_workout_exercise(v_workout_exercise,v_old_exercise)
  into v_continuation;

  if v_continuation=v_workout_exercise then
    raise exception 'Mid-workout switch did not create a continuation row';
  end if;

  if not exists(
    select 1
    from public.workout_exercises src
    where src.id=v_workout_exercise
      and src.exercise_id=v_new_exercise
      and src.completed_at is not null
      and exists(
        select 1 from public.workout_sets s
        where s.workout_exercise_id=src.id
          and s.set_number=1
          and s.reps=10
          and s.completed_at is not null
      )
  ) then
    raise exception 'Source exercise or its completed set was not preserved';
  end if;

  if not exists(
    select 1
    from public.workout_exercises next
    where next.id=v_continuation
      and next.workout_session_id=v_session
      and next.exercise_id=v_old_exercise
      and next.continued_from_workout_exercise_id=v_workout_exercise
      and next.prescribed_sets=2
      and next.completed_at is null
  ) then
    raise exception 'Continuation exercise does not contain the remaining prescribed work';
  end if;

  if not exists(
    select 1 from public.workout_sessions
    where id=v_session and active_workout_exercise_id=v_continuation
  ) then
    raise exception 'Workout did not move focus to the continuation exercise';
  end if;

  -- Lost-response retry returns the same continuation instead of duplicating it.
  select public.replace_workout_exercise(v_workout_exercise,v_old_exercise)
  into v_retry;

  if v_retry<>v_continuation then
    raise exception 'Mid-workout switch retry was not idempotent';
  end if;

  if (
    select count(*) from public.workout_exercises
    where continued_from_workout_exercise_id=v_workout_exercise
  )<>1 then
    raise exception 'Mid-workout switch created duplicate continuation rows';
  end if;

  begin
    perform public.reopen_my_workout_exercise(v_workout_exercise);
    raise exception 'QA_EXPECTED_SWITCHED_SOURCE_REOPEN_REJECTION_MISSING';
  exception when others then
    if sqlerrm='QA_EXPECTED_SWITCHED_SOURCE_REOPEN_REJECTION_MISSING' then raise; end if;
    if position('Switched exercise segment cannot be reopened' in sqlerrm)=0 then
      raise;
    end if;
  end;
end $;

rollback;
