-- Transactional smoke for reopening saved workout results. All changes roll back.

begin;

do $$
declare
  v_client uuid;
  v_exercise uuid;
  v_modality text;
  v_session uuid;
  v_workout_exercise uuid;
  v_cardio uuid;
begin
  select id into v_client from public.profiles where role='client' order by created_at limit 1;
  select id into v_exercise from public.exercises where is_active=true order by created_at limit 1;
  select code into v_modality from public.cardio_modalities order by code limit 1;

  if v_client is null or v_exercise is null or v_modality is null then
    raise exception 'QA reopen-result smoke requires a client, exercise and cardio modality';
  end if;

  update public.workout_sessions
  set status='abandoned',completed_at=coalesce(completed_at,now()),updated_at=now()
  where client_id=v_client and status='in_progress';

  insert into public.workout_sessions(client_id,status,started_at,updated_at)
  values(v_client,'in_progress',now(),now())
  returning id into v_session;

  insert into public.workout_exercises(workout_session_id,exercise_id,prescribed_sets)
  values(v_session,v_exercise,3)
  returning id into v_workout_exercise;

  insert into public.workout_sets(workout_exercise_id,set_number,weight_kg,reps,rir,is_warmup,completed_at)
  values(v_workout_exercise,1,20,10,2,false,now());

  insert into public.workout_cardio_entries(workout_session_id,modality_code,actual_duration_minutes,completed_at)
  values(v_session,v_modality,15,now())
  returning id into v_cardio;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_client,'role','authenticated')::text,true);

  if not public.reopen_my_workout_set(v_workout_exercise,1) then
    raise exception 'Workout set reopen returned false';
  end if;
  if not public.reopen_my_workout_set(v_workout_exercise,1) then
    raise exception 'Workout set reopen retry returned false';
  end if;
  if exists(select 1 from public.workout_sets where workout_exercise_id=v_workout_exercise and set_number=1 and completed_at is not null) then
    raise exception 'Workout set remained completed';
  end if;

  if not public.reopen_my_workout_cardio(v_cardio) then
    raise exception 'Cardio reopen returned false';
  end if;
  if not public.reopen_my_workout_cardio(v_cardio) then
    raise exception 'Cardio reopen retry returned false';
  end if;
  if exists(select 1 from public.workout_cardio_entries where id=v_cardio and completed_at is not null) then
    raise exception 'Cardio remained completed';
  end if;
end $$;

rollback;
