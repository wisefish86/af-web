-- Transactional smoke for RPC-only workout mutation permissions.

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
    raise exception 'QA RPC-only smoke requires client, exercise and cardio modality';
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

  perform set_config('qa.client',v_client::text,true);
  perform set_config('qa.session',v_session::text,true);
  perform set_config('qa.exercise',v_workout_exercise::text,true);
  perform set_config('qa.cardio',v_cardio::text,true);
end $$;

select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub',current_setting('qa.client'),'role','authenticated')::text,
  true
);

set local role authenticated;

do $$
declare
  v_session uuid:=current_setting('qa.session')::uuid;
  v_exercise uuid:=current_setting('qa.exercise')::uuid;
  v_cardio uuid:=current_setting('qa.cardio')::uuid;
  v_completed timestamptz;
begin
  if has_table_privilege('authenticated','public.workout_sessions','INSERT')
     or has_table_privilege('authenticated','public.workout_sessions','UPDATE')
     or has_table_privilege('authenticated','public.workout_sessions','DELETE')
     or has_table_privilege('authenticated','public.workout_exercises','INSERT')
     or has_table_privilege('authenticated','public.workout_exercises','UPDATE')
     or has_table_privilege('authenticated','public.workout_exercises','DELETE')
     or has_table_privilege('authenticated','public.workout_sets','INSERT')
     or has_table_privilege('authenticated','public.workout_sets','UPDATE')
     or has_table_privilege('authenticated','public.workout_sets','DELETE')
     or has_table_privilege('authenticated','public.workout_cardio_entries','INSERT')
     or has_table_privilege('authenticated','public.workout_cardio_entries','UPDATE')
     or has_table_privilege('authenticated','public.workout_cardio_entries','DELETE')
  then
    raise exception 'Direct workout DML grant remains';
  end if;

  if not has_table_privilege('authenticated','public.workout_sessions','SELECT')
     or not has_table_privilege('authenticated','public.workout_exercises','SELECT')
     or not has_table_privilege('authenticated','public.workout_sets','SELECT')
     or not has_table_privilege('authenticated','public.workout_cardio_entries','SELECT')
  then
    raise exception 'Workout read access was removed unexpectedly';
  end if;

  if has_function_privilege('anon','public.start_workout(uuid)','EXECUTE')
     or has_function_privilege('anon','public.save_workout_set(uuid,integer,numeric,integer,numeric,boolean,timestamptz)','EXECUTE')
     or has_function_privilege('anon','public.complete_workout_v2(uuid,text,jsonb)','EXECUTE')
     or has_function_privilege('anon','public.save_workout_ui_state(uuid,uuid,timestamptz,text)','EXECUTE')
     or has_function_privilege('anon','public.complete_my_workout_exercise(uuid)','EXECUTE')
     or has_function_privilege('anon','public.complete_my_workout_cardio(uuid,integer,integer,numeric,numeric,text)','EXECUTE')
  then
    raise exception 'Anonymous role can execute workout mutation RPC';
  end if;

  if has_function_privilege('authenticated','public.complete_workout(uuid,text)','EXECUTE')
     or has_function_privilege('authenticated','public.auto_complete_stale_workout(uuid)','EXECUTE')
     or has_function_privilege('authenticated','public.guard_completed_workout_child()','EXECUTE')
     or has_function_privilege('authenticated','public.guard_completed_workout_session()','EXECUTE')
     or has_function_privilege('authenticated','public.snapshot_workout_exercise_warmup()','EXECUTE')
  then
    raise exception 'Legacy or trigger workout function remains directly executable';
  end if;

  perform public.save_workout_ui_state(v_session,v_exercise,now()+interval '90 seconds','QA rest');
  perform public.save_workout_set(v_exercise,1,20,10,2,false,now());

  v_completed:=public.complete_my_workout_exercise(v_exercise);
  if v_completed is null then raise exception 'Exercise completion failed through RPC-only path'; end if;

  begin
    perform public.save_workout_set(v_exercise,2,20,10,2,false,now());
    raise exception 'QA_EXPECTED_COMPLETED_EXERCISE_SET_REJECTION_MISSING';
  exception when others then
    if sqlerrm='QA_EXPECTED_COMPLETED_EXERCISE_SET_REJECTION_MISSING' then raise; end if;
    if position('Editable workout exercise not found or access denied' in sqlerrm)=0 then raise; end if;
  end;

  perform public.reopen_my_workout_exercise(v_exercise);
  perform public.save_workout_set(v_exercise,2,20,10,2,false,now());

  v_completed:=public.complete_my_workout_cardio(v_cardio,15,120,5,2.5,null);
  if v_completed is null then raise exception 'Cardio completion failed through RPC-only path'; end if;
  perform public.reopen_my_workout_cardio(v_cardio);
  perform public.complete_my_workout_cardio(v_cardio,16,121,5,2.6,null);

  perform public.delete_my_workout_set(v_exercise,2);
end $$;

reset role;
rollback;
