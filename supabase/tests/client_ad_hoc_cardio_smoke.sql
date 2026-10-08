-- Client ad-hoc cardio reliability smoke. All mutations roll back.

begin;

do $$
declare
  v_client uuid;
  v_modality text;
  v_session uuid;
  v_closed_session uuid;
  v_request uuid:=gen_random_uuid();
  v_first uuid;
  v_retry uuid;
  v_delete_request uuid:=gen_random_uuid();
  v_delete uuid;
  v_closed_rejected boolean:=false;
begin
  select cc.client_id into v_client
  from public.coach_clients cc
  where cc.status='active'
  order by cc.started_at
  limit 1;

  select code into v_modality
  from public.cardio_modalities
  order by sort_order,code
  limit 1;

  if v_client is null or v_modality is null then
    raise exception 'QA ad-hoc cardio smoke requires an active client and cardio modality';
  end if;

  insert into public.workout_sessions(
    client_id,status,started_at,updated_at,training_day_name_snapshot,session_type_snapshot
  ) values (
    v_client,'in_progress',now(),now(),'QA ad-hoc cardio','mixed'
  ) returning id into v_session;

  insert into public.workout_sessions(
    client_id,status,started_at,completed_at,updated_at,training_day_name_snapshot,session_type_snapshot
  ) values (
    v_client,'completed',now()-interval '30 minutes',now(),now(),'QA closed cardio','mixed'
  ) returning id into v_closed_session;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',v_client,'role','authenticated')::text,
    true
  );
  set local role authenticated;

  select public.add_my_workout_cardio(
    v_session,v_request,v_modality,25,'QA cardio',135,6,4.2,10.5,2
  ) into v_first;

  select public.add_my_workout_cardio(
    v_session,v_request,v_modality,25,'QA cardio',135,6,4.2,10.5,2
  ) into v_retry;

  if v_first is distinct from v_retry then
    raise exception 'Ad-hoc cardio retry did not return the original row';
  end if;

  if (
    select count(*)
    from public.workout_cardio_entries
    where workout_session_id=v_session and client_request_id=v_request
  )<>1 then
    raise exception 'Ad-hoc cardio retry created a duplicate row';
  end if;

  if not exists(
    select 1
    from public.workout_cardio_entries
    where id=v_first
      and entry_origin='client_ad_hoc'
      and program_cardio_block_id is null
      and prescribed_duration_minutes=25
      and prescribed_hr_min=135
      and prescribed_hr_max=135
      and prescribed_rpe_min=6
      and prescribed_rpe_max=6
      and prescribed_distance_km=4.2
      and prescribed_speed_kmh=10.5
      and prescribed_incline_percent=2
  ) then
    raise exception 'Ad-hoc cardio payload or lineage is incorrect';
  end if;

  select public.add_my_workout_cardio(
    v_session,v_delete_request,v_modality,12,'QA removable',null,null,null,null,null
  ) into v_delete;

  perform public.remove_my_workout_cardio(v_delete);

  if exists(select 1 from public.workout_cardio_entries where id=v_delete) then
    raise exception 'Unfinished client ad-hoc cardio was not removed';
  end if;

  begin
    perform public.add_my_workout_cardio(
      v_closed_session,gen_random_uuid(),v_modality,10,null,null,null,null,null,null
    );
  exception when others then
    if sqlerrm ilike '%Active workout not found%' then
      v_closed_rejected:=true;
    else
      raise;
    end if;
  end;

  if not v_closed_rejected then
    raise exception 'Completed workout accepted ad-hoc cardio';
  end if;

  reset role;
end $$;

rollback;
