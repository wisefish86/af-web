-- Client private exercise + one-off workout insertion smoke. All mutations roll back.

begin;

do $$
declare
  v_client uuid;
  v_coach uuid;
  v_other_user uuid;
  v_equipment text;
  v_session uuid;
  v_request uuid:=gen_random_uuid();
  v_reuse_request uuid:=gen_random_uuid();
  v_first uuid;
  v_retry uuid;
  v_reused uuid;
  v_exercise uuid;
  v_remove_blocked boolean:=false;
begin
  select cc.client_id,cc.coach_id
    into v_client,v_coach
  from public.coach_clients cc
  where cc.status='active'
    and not exists(
      select 1 from public.workout_sessions ws
      where ws.client_id=cc.client_id and ws.status='in_progress'
    )
  order by cc.started_at
  limit 1;

  select code into v_equipment
  from public.exercise_equipment
  order by sort_order,code
  limit 1;

  if v_client is null then
    raise exception 'QA private exercise smoke requires an active idle client';
  end if;

  insert into public.workout_sessions(
    client_id,status,started_at,updated_at,training_day_name_snapshot,session_type_snapshot
  ) values (
    v_client,'in_progress',now(),now(),'QA private exercise','strength'
  ) returning id into v_session;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',v_client,'role','authenticated')::text,
    true
  );
  set local role authenticated;

  select public.add_my_custom_workout_exercise(
    v_session,v_request,null,'QA private exercise','reps_only',v_equipment,
    'Private QA note',3,8,12,true,1,2,90
  ) into v_first;

  select public.add_my_custom_workout_exercise(
    v_session,v_request,null,'QA private exercise','reps_only',v_equipment,
    'Private QA note',3,8,12,true,1,2,90
  ) into v_retry;

  if v_first is distinct from v_retry then
    raise exception 'Custom exercise retry did not return the original workout block';
  end if;

  select we.exercise_id into v_exercise
  from public.workout_exercises we
  where we.id=v_first;

  if (
    select count(*)
    from public.workout_exercises
    where workout_session_id=v_session and client_request_id=v_request
  )<>1 then
    raise exception 'Custom exercise retry created a duplicate workout block';
  end if;

  if (
    select count(*)
    from public.exercises
    where created_by=v_client and client_request_id=v_request
  )<>1 then
    raise exception 'Custom exercise retry created a duplicate personal exercise';
  end if;

  if not exists(
    select 1
    from public.exercises e
    where e.id=v_exercise
      and e.exercise_scope='client_private'
      and e.created_by=v_client
      and e.name='QA private exercise'
      and e.tracking_type='reps_only'
      and e.is_active=true
  ) then
    raise exception 'Personal exercise privacy or payload is incorrect';
  end if;

  if not exists(
    select 1
    from public.workout_exercises we
    where we.id=v_first
      and we.exercise_id=v_exercise
      and we.program_exercise_id is null
      and we.entry_origin='client_ad_hoc'
      and we.tracking_type_snapshot='reps_only'
      and we.prescribed_sets=3
      and we.reps_min=8
      and we.reps_max=12
      and we.rir_enabled=true
      and we.rir_min=1
      and we.rir_max=2
      and we.rest_seconds=90
  ) then
    raise exception 'Custom workout block lineage or prescription is incorrect';
  end if;

  -- Reusing a saved personal exercise must not clone the exercise entity.
  select public.add_my_custom_workout_exercise(
    v_session,v_reuse_request,v_exercise,null,null,null,null,
    2,10,15,false,null,null,60
  ) into v_reused;

  if not exists(
    select 1 from public.workout_exercises
    where id=v_reused and exercise_id=v_exercise and entry_origin='client_ad_hoc'
  ) then
    raise exception 'Existing personal exercise was not reused';
  end if;

  perform public.remove_my_custom_workout_exercise(v_reused);

  if exists(select 1 from public.workout_exercises where id=v_reused) then
    raise exception 'Empty ad-hoc personal exercise block was not removed';
  end if;

  if not exists(select 1 from public.exercises where id=v_exercise) then
    raise exception 'Removing a workout block unexpectedly deleted the personal exercise';
  end if;

  -- A saved result must never be silently destroyed by removing the block.
  perform public.save_workout_set(v_first,1,null,10,2,false,now());
  begin
    perform public.remove_my_custom_workout_exercise(v_first);
  exception when others then
    if sqlerrm ilike '%Remove saved sets%' then
      v_remove_blocked:=true;
    else
      raise;
    end if;
  end;

  if not v_remove_blocked then
    raise exception 'Custom exercise with saved sets was removable';
  end if;

  reset role;

  -- Public preview must never see the private exercise.
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('role','anon')::text,
    true
  );
  set local role anon;

  if exists(select 1 from public.exercises where id=v_exercise) then
    raise exception 'Private exercise leaked to anon preview';
  end if;

  reset role;

  -- The assigned active trainer can read the private exercise for coaching context.
  if v_coach is not null then
    perform set_config(
      'request.jwt.claims',
      jsonb_build_object('sub',v_coach,'role','authenticated')::text,
      true
    );
    set local role authenticated;

    if not exists(select 1 from public.exercises where id=v_exercise) then
      raise exception 'Assigned trainer cannot read client private exercise';
    end if;

    reset role;
  end if;

  -- An unrelated authenticated user cannot read it.
  select p.id into v_other_user
  from public.profiles p
  where p.id<>v_client
    and p.id<>coalesce(v_coach,'00000000-0000-0000-0000-000000000000'::uuid)
  order by p.created_at
  limit 1;

  if v_other_user is not null then
    perform set_config(
      'request.jwt.claims',
      jsonb_build_object('sub',v_other_user,'role','authenticated')::text,
      true
    );
    set local role authenticated;

    if exists(select 1 from public.exercises where id=v_exercise) then
      raise exception 'Private exercise leaked to unrelated authenticated user';
    end if;

    reset role;
  end if;
end $$;

rollback;
