-- Cross-device workout conflict smoke. All test data rolls back.

begin;

do $$
declare
  v_client uuid;
  v_exercise uuid;
  v_session uuid;
  v_workout_exercise uuid;
begin
  select p.id
  into v_client
  from public.profiles p
  where p.role='client'
    and not exists(
      select 1 from public.workout_sessions ws
      where ws.client_id=p.id and ws.status='in_progress'
    )
  order by p.created_at
  limit 1;

  select id into v_exercise
  from public.exercises
  where is_active=true
  order by created_at
  limit 1;

  if v_client is null or v_exercise is null then
    raise exception 'QA cross-device smoke requires an idle client and an exercise';
  end if;

  insert into public.workout_sessions(client_id,status,started_at,updated_at)
  values(v_client,'in_progress',now(),now())
  returning id into v_session;

  insert into public.workout_exercises(workout_session_id,exercise_id,prescribed_sets)
  values(v_session,v_exercise,3)
  returning id into v_workout_exercise;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_client,'role','authenticated')::text,true);
  set local role authenticated;

  perform public.save_workout_set(v_workout_exercise,1,20,10,2,false,now());
  perform public.save_workout_set(v_workout_exercise,1,20,10,2,false,now());

  begin
    perform public.save_workout_set(v_workout_exercise,1,25,8,1,false,now());
    raise exception 'EXPECTED_CONFLICT_MISSING';
  exception when others then
    if sqlerrm='EXPECTED_CONFLICT_MISSING' then raise; end if;
    if position('changed on another device' in sqlerrm)=0 then raise; end if;
  end;

  perform public.reopen_my_workout_set(v_workout_exercise,1);
  perform public.save_workout_set(v_workout_exercise,1,25,8,1,false,now());

  begin
    perform public.complete_workout_v2(
      v_session,
      null,
      jsonb_build_array(jsonb_build_object(
        'workout_exercise_id',v_workout_exercise,
        'set_number',1,
        'weight_kg',20,
        'reps',10,
        'rir',2,
        'is_warmup',false,
        'completed_at',now()
      ))
    );
    raise exception 'EXPECTED_WORKOUT_CONFLICT_MISSING';
  exception when others then
    if sqlerrm='EXPECTED_WORKOUT_CONFLICT_MISSING' then raise; end if;
    if position('changed on another device' in sqlerrm)=0 then raise; end if;
  end;

  if not exists(
    select 1 from public.workout_sets
    where workout_exercise_id=v_workout_exercise
      and set_number=1
      and weight_kg=25 and reps=8 and rir=1
      and completed_at is not null
  ) then
    raise exception 'Corrected set was not preserved';
  end if;

  reset role;
end $$;

rollback;
