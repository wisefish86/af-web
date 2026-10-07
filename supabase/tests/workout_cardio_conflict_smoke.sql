-- Cardio completion/reopen/cross-device reliability smoke.
-- Identical completion retries are idempotent; different stale values are rejected
-- until explicit reopen. All mutations roll back.

begin;

do $$
declare
  v_client uuid;
  v_modality text;
  v_session uuid;
  v_cardio uuid;
  v_first_completed timestamptz;
  v_retry_completed timestamptz;
  v_changed_completed timestamptz;
  v_conflict_rejected boolean:=false;
begin
  select cc.client_id into v_client
  from public.coach_clients cc
  where cc.status='active'
  order by cc.started_at
  limit 1;

  select code into v_modality
  from public.cardio_modalities
  order by code
  limit 1;

  if v_client is null or v_modality is null then
    raise exception 'QA cardio smoke requires an active client and cardio modality';
  end if;

  update public.workout_sessions
  set status='abandoned',completed_at=coalesce(completed_at,now()),updated_at=now()
  where client_id=v_client and status='in_progress';

  insert into public.workout_sessions(
    client_id,status,started_at,updated_at,training_day_name_snapshot,session_type_snapshot
  ) values (
    v_client,'in_progress',now(),now(),'QA cardio','cardio'
  ) returning id into v_session;

  insert into public.workout_cardio_entries(
    workout_session_id,modality_code,name,sort_order,prescribed_duration_minutes
  ) values (
    v_session,v_modality,'QA cardio',10,20
  ) returning id into v_cardio;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',v_client,'role','authenticated')::text,
    true
  );
  set local role authenticated;

  select public.complete_my_workout_cardio(v_cardio,20,130,6,4.5,null)
  into v_first_completed;

  select public.complete_my_workout_cardio(v_cardio,20,130,6,4.5,null)
  into v_retry_completed;

  if v_retry_completed is distinct from v_first_completed then
    raise exception 'Identical cardio retry changed completed_at';
  end if;

  begin
    perform public.complete_my_workout_cardio(v_cardio,25,140,7,5.0,null);
  exception when others then
    if sqlerrm ilike '%already completed%' then
      v_conflict_rejected:=true;
    else
      raise;
    end if;
  end;

  if not v_conflict_rejected then
    raise exception 'Different stale cardio completion was not rejected';
  end if;

  perform public.reopen_my_workout_cardio(v_cardio);
  perform public.reopen_my_workout_cardio(v_cardio);

  select public.complete_my_workout_cardio(v_cardio,25,140,7,5.0,null)
  into v_changed_completed;

  if v_changed_completed is null then
    raise exception 'Reopened cardio did not save corrected values';
  end if;

  if not exists(
    select 1 from public.workout_cardio_entries
    where id=v_cardio
      and actual_duration_minutes=25
      and actual_hr_avg=140
      and actual_rpe=7
      and actual_distance_km=5.0
      and completed_at is not null
  ) then
    raise exception 'Corrected cardio values did not persist after explicit reopen';
  end if;

  reset role;
end $$;

rollback;
