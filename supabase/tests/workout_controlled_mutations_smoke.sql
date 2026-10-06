-- Transactional smoke for controlled workout exercise/cardio mutation RPCs and result constraints.

begin;

do $$
declare
  v_client uuid;
  v_exercise uuid;
  v_modality text;
  v_session uuid;
  v_workout_exercise uuid;
  v_cardio uuid;
  v_first timestamptz;
  v_second timestamptz;
begin
  select id into v_client from public.profiles where role='client' order by created_at limit 1;
  select id into v_exercise from public.exercises where is_active=true order by created_at limit 1;
  select code into v_modality from public.cardio_modalities order by code limit 1;

  if v_client is null or v_exercise is null or v_modality is null then
    raise exception 'QA controlled mutation smoke requires client, exercise and cardio modality';
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

  insert into public.workout_cardio_entries(workout_session_id,modality_code)
  values(v_session,v_modality)
  returning id into v_cardio;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_client,'role','authenticated')::text,true);

  v_first:=public.complete_my_workout_exercise(v_workout_exercise);
  v_second:=public.complete_my_workout_exercise(v_workout_exercise);
  if v_first is null or v_second is distinct from v_first then
    raise exception 'Exercise completion is not retry-safe';
  end if;
  if not public.reopen_my_workout_exercise(v_workout_exercise) then
    raise exception 'Exercise reopen failed';
  end if;
  if not public.reopen_my_workout_exercise(v_workout_exercise) then
    raise exception 'Exercise reopen retry failed';
  end if;

  v_first:=public.complete_my_workout_cardio(v_cardio,15,120,5,2.5,null);
  v_second:=public.complete_my_workout_cardio(v_cardio,15,120,5,2.5,null);
  if v_first is null or v_second is distinct from v_first then
    raise exception 'Cardio completion is not retry-safe';
  end if;

  begin
    perform public.complete_my_workout_cardio(v_cardio,20,120,5,2.5,null);
    raise exception 'QA_EXPECTED_CARDIO_CHANGE_REJECTION_MISSING';
  exception when others then
    if sqlerrm='QA_EXPECTED_CARDIO_CHANGE_REJECTION_MISSING' then raise; end if;
  end;

  if not public.reopen_my_workout_cardio(v_cardio) then
    raise exception 'Cardio reopen failed';
  end if;
  perform public.complete_my_workout_cardio(v_cardio,20,120,5,2.5,null);

  begin
    insert into public.workout_sets(workout_exercise_id,set_number,reps,is_warmup,completed_at)
    values(v_workout_exercise,1,0,false,now());
    raise exception 'QA_EXPECTED_ZERO_REPS_CONSTRAINT_MISSING';
  exception when check_violation then null;
  end;

  begin
    insert into public.workout_sets(workout_exercise_id,set_number,reps,is_warmup,completed_at)
    values(v_workout_exercise,0,10,false,now());
    raise exception 'QA_EXPECTED_SET_KIND_CONSTRAINT_MISSING';
  exception when check_violation then null;
  end;

  begin
    update public.workout_cardio_entries
    set actual_duration_minutes=null,completed_at=now()
    where id=v_cardio;
    raise exception 'QA_EXPECTED_CARDIO_DURATION_CONSTRAINT_MISSING';
  exception when check_violation then null;
  end;
end $$;

rollback;
