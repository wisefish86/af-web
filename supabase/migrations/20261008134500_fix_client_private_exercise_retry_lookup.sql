-- Fix retry lookup so it does not null out validated name/tracking fields.
create or replace function public.add_my_custom_workout_exercise(
  p_workout_session_id uuid,
  p_request_id uuid,
  p_exercise_id uuid,
  p_name text,
  p_tracking_type text,
  p_equipment_code text,
  p_notes text,
  p_prescribed_sets integer,
  p_reps_min integer,
  p_reps_max integer,
  p_rir_enabled boolean,
  p_rir_min numeric,
  p_rir_max numeric,
  p_rest_seconds integer
) returns uuid
language plpgsql
security definer
set search_path to pg_catalog, public
as $function$
declare
  v_user uuid:=auth.uid();
  v_existing uuid;
  v_exercise_id uuid;
  v_name text;
  v_tracking text;
  v_notes text:=nullif(btrim(p_notes),'');
  v_sort_order integer;
  v_code text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_request_id is null then raise exception 'Request id is required'; end if;

  perform 1
  from public.workout_sessions ws
  where ws.id=p_workout_session_id
    and ws.client_id=v_user
    and ws.status='in_progress'
  for update;

  if not found then
    raise exception 'Active workout not found or access denied';
  end if;

  if not exists(
    select 1 from public.coach_clients cc
    where cc.client_id=v_user and cc.status='active'
  ) then
    raise exception 'Client access is inactive';
  end if;

  select we.id into v_existing
  from public.workout_exercises we
  where we.workout_session_id=p_workout_session_id
    and we.client_request_id=p_request_id;

  if v_existing is not null then return v_existing; end if;

  if p_prescribed_sets is null or p_prescribed_sets not between 1 and 20 then
    raise exception 'Sets must be between 1 and 20';
  end if;
  if p_reps_min is null or p_reps_max is null
     or p_reps_min not between 1 and 1000
     or p_reps_max not between 1 and 1000
     or p_reps_min>p_reps_max then
    raise exception 'Invalid repetition range';
  end if;
  if p_rest_seconds is null or p_rest_seconds not between 15 and 1800 then
    raise exception 'Rest must be between 15 and 1800 seconds';
  end if;
  if p_rir_enabled then
    if p_rir_min is null or p_rir_max is null
       or p_rir_min<0 or p_rir_max>3 or p_rir_min>p_rir_max then
      raise exception 'RIR must be between 0 and 3';
    end if;
  end if;
  if v_notes is not null and char_length(v_notes)>1000 then
    raise exception 'Notes are too long';
  end if;

  if p_exercise_id is not null then
    select e.id,e.name,e.tracking_type
      into v_exercise_id,v_name,v_tracking
    from public.exercises e
    where e.id=p_exercise_id
      and e.created_by=v_user
      and e.exercise_scope='client_private'
      and e.is_active=true;

    if not found then
      raise exception 'Personal exercise not found or access denied';
    end if;
  else
    v_name:=nullif(btrim(p_name),'');
    v_tracking:=coalesce(nullif(btrim(p_tracking_type),''),'weight_reps');

    if v_name is null then raise exception 'Exercise name is required'; end if;
    if char_length(v_name)>120 then raise exception 'Exercise name is too long'; end if;
    if v_tracking not in ('weight_reps','reps_only') then
      raise exception 'This tracking type is not supported in workout execution yet';
    end if;
    if p_equipment_code is not null and btrim(p_equipment_code)<>'' and not exists(
      select 1 from public.exercise_equipment eq where eq.code=btrim(p_equipment_code)
    ) then
      raise exception 'Unknown equipment';
    end if;

    select e.id
      into v_exercise_id
    from public.exercises e
    where e.created_by=v_user
      and e.client_request_id=p_request_id;

    if v_exercise_id is null then
      v_code:='CLIENT_'||upper(replace(p_request_id::text,'-',''));
      insert into public.exercises(
        code,name,description,equipment_code,default_rest_seconds,
        exercise_type,tracking_type,is_active,created_by,exercise_scope,client_request_id,updated_at
      ) values (
        v_code,v_name,v_notes,nullif(btrim(p_equipment_code),''),
        p_rest_seconds,'compound',v_tracking,true,v_user,'client_private',p_request_id,now()
      )
      returning id into v_exercise_id;
    end if;
  end if;

  select coalesce(max(we.sort_order),0)+10 into v_sort_order
  from public.workout_exercises we
  where we.workout_session_id=p_workout_session_id;

  insert into public.workout_exercises(
    workout_session_id,program_exercise_id,exercise_id,sort_order,notes,
    prescribed_sets,reps_min,reps_max,rir_min,rir_max,rir_enabled,rest_seconds,
    allow_substitution,exercise_role,trainer_notes,substitution_policy,
    prescribed_exercise_id,exercise_name_snapshot,instructions_snapshot,
    warmup_enabled,entry_origin,client_request_id,tracking_type_snapshot
  ) values (
    p_workout_session_id,null,v_exercise_id,v_sort_order,v_notes,
    p_prescribed_sets,p_reps_min,p_reps_max,
    case when p_rir_enabled then p_rir_min else null end,
    case when p_rir_enabled then p_rir_max else null end,
    coalesce(p_rir_enabled,false),p_rest_seconds,
    false,'optional',null,'strict',
    null,v_name,null,
    false,'client_ad_hoc',p_request_id,v_tracking
  )
  returning id into v_existing;

  return v_existing;
end;
$function$;

revoke all on function public.add_my_custom_workout_exercise(
  uuid,uuid,uuid,text,text,text,text,integer,integer,integer,boolean,numeric,numeric,integer
) from public,anon;
grant execute on function public.add_my_custom_workout_exercise(
  uuid,uuid,uuid,text,text,text,text,integer,integer,integer,boolean,numeric,numeric,integer
) to authenticated;
