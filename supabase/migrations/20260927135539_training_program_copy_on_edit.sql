
-- Preserve substitution policy on save and support copy-on-edit training versions.

create or replace function public.create_training_program(p_program jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_program_id uuid;
  v_day_id uuid;
  v_session jsonb;
  v_item jsonb;
  v_day_index integer := 0;
  v_sort integer;
  v_client_id uuid;
  v_exercise_id uuid;
  v_group_id uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  if not exists (select 1 from public.profiles p where p.id=v_user and p.role='trainer')
    then raise exception 'Trainer role required'; end if;

  if nullif(btrim(p_program->>'name'),'') is null
    then raise exception 'Program name is required'; end if;

  v_client_id := nullif(p_program->>'client_id','')::uuid;

  if v_client_id is not null and not exists (
    select 1 from public.coach_clients cc
    where cc.coach_id=v_user and cc.client_id=v_client_id and cc.status='active'
  ) then raise exception 'Client is not assigned to this trainer'; end if;

  insert into public.training_programs(
    client_id,name,description,is_active,created_by,is_template,version,status,weekly_frequency,updated_at
  ) values (
    v_client_id,btrim(p_program->>'name'),nullif(btrim(p_program->>'description'),''),
    true,v_user,coalesce((p_program->>'is_template')::boolean,v_client_id is null),
    1,'draft',nullif(p_program->>'weekly_frequency','')::integer,now()
  ) returning id into v_program_id;

  for v_session in select value from jsonb_array_elements(coalesce(p_program->'sessions','[]'::jsonb))
  loop
    v_day_index := v_day_index + 1;

    insert into public.training_days(
      program_id,day_index,name,notes,session_type,planned_duration_minutes
    ) values (
      v_program_id,v_day_index,
      coalesce(nullif(btrim(v_session->>'name'),''),'Сессия ' || v_day_index),
      nullif(btrim(v_session->>'notes'),''),
      coalesce(nullif(v_session->>'session_type',''),'strength'),
      nullif(v_session->>'planned_duration_minutes','')::integer
    ) returning id into v_day_id;

    v_sort := 0;
    for v_item in select value from jsonb_array_elements(coalesce(v_session->'items','[]'::jsonb))
    loop
      v_sort := v_sort + 10;

      if v_item->>'type'='exercise' then
        v_exercise_id := nullif(v_item->>'exercise_id','')::uuid;
        if v_exercise_id is null or not exists (
          select 1 from public.exercises e where e.id=v_exercise_id and e.is_active=true
        ) then raise exception 'Exercise not found'; end if;

        v_group_id := nullif(v_item->>'substitution_group_id','')::uuid;
        if v_group_id is not null and not exists (
          select 1 from public.exercise_substitution_groups g where g.id=v_group_id
        ) then raise exception 'Substitution group not found'; end if;

        insert into public.program_exercises(
          training_day_id,substitution_group_id,default_exercise_id,sort_order,
          sets_min,sets_max,reps_min,reps_max,rir_min,rir_max,notes,
          exercise_role,progression_notes,rest_seconds,rir_enabled,allow_client_substitution,
          substitution_policy
        ) values (
          v_day_id,v_group_id,v_exercise_id,v_sort,
          coalesce(nullif(v_item->>'sets_min','')::integer,3),
          coalesce(nullif(v_item->>'sets_max','')::integer,coalesce(nullif(v_item->>'sets_min','')::integer,3)),
          nullif(v_item->>'reps_min','')::integer,nullif(v_item->>'reps_max','')::integer,
          nullif(v_item->>'rir_min','')::numeric,nullif(v_item->>'rir_max','')::numeric,
          nullif(btrim(v_item->>'notes'),''),
          coalesce(nullif(v_item->>'exercise_role',''),'main'),
          nullif(btrim(v_item->>'progression_notes'),''),
          coalesce(nullif(v_item->>'rest_seconds','')::integer,120),
          coalesce((v_item->>'rir_enabled')::boolean,true),
          coalesce((v_item->>'allow_client_substitution')::boolean,true),
          coalesce(nullif(v_item->>'substitution_policy',''),'strict')
        );

      elsif v_item->>'type'='cardio' then
        insert into public.program_cardio_blocks(
          training_day_id,modality_code,name,sort_order,duration_minutes,target_hr_min,target_hr_max,
          target_rpe_min,target_rpe_max,speed_kmh,incline_percent,distance_km,notes
        ) values (
          v_day_id,coalesce(nullif(v_item->>'modality_code',''),'other'),
          nullif(btrim(v_item->>'name'),''),v_sort,
          nullif(v_item->>'duration_minutes','')::integer,
          nullif(v_item->>'target_hr_min','')::integer,nullif(v_item->>'target_hr_max','')::integer,
          nullif(v_item->>'target_rpe_min','')::numeric,nullif(v_item->>'target_rpe_max','')::numeric,
          nullif(v_item->>'speed_kmh','')::numeric,nullif(v_item->>'incline_percent','')::numeric,
          nullif(v_item->>'distance_km','')::numeric,nullif(btrim(v_item->>'notes'),'')
        );
      else
        raise exception 'Unsupported training item type: %', v_item->>'type';
      end if;
    end loop;
  end loop;

  return v_program_id;
end;
$$;

create or replace function public.clone_training_program(p_program_id uuid)
returns uuid
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_source public.training_programs%rowtype;
  v_new_program uuid;
  v_old_day record;
  v_new_day uuid;
  v_next_version integer;
begin
  select * into v_source
  from public.training_programs tp
  where tp.id=p_program_id and tp.created_by=v_user;

  if not found then raise exception 'Program not found or access denied'; end if;

  select coalesce(max(version),0)+1 into v_next_version
  from public.training_programs
  where family_id=v_source.family_id;

  insert into public.training_programs(
    family_id,supersedes_program_id,client_id,name,description,is_active,created_by,
    is_template,version,status,weekly_frequency,updated_at
  ) values (
    v_source.family_id,v_source.id,v_source.client_id,v_source.name,v_source.description,
    false,v_user,v_source.is_template,v_next_version,'draft',v_source.weekly_frequency,now()
  ) returning id into v_new_program;

  for v_old_day in
    select * from public.training_days where program_id=v_source.id order by day_index
  loop
    insert into public.training_days(program_id,day_index,name,notes,session_type,planned_duration_minutes)
    values(v_new_program,v_old_day.day_index,v_old_day.name,v_old_day.notes,v_old_day.session_type,v_old_day.planned_duration_minutes)
    returning id into v_new_day;

    insert into public.program_exercises(
      training_day_id,substitution_group_id,default_exercise_id,sort_order,
      sets_min,sets_max,reps_min,reps_max,rir_min,rir_max,notes,exercise_role,
      progression_notes,rest_seconds,rir_enabled,allow_client_substitution,substitution_policy
    )
    select v_new_day,pe.substitution_group_id,pe.default_exercise_id,pe.sort_order,
      pe.sets_min,pe.sets_max,pe.reps_min,pe.reps_max,pe.rir_min,pe.rir_max,pe.notes,pe.exercise_role,
      pe.progression_notes,pe.rest_seconds,pe.rir_enabled,pe.allow_client_substitution,pe.substitution_policy
    from public.program_exercises pe
    where pe.training_day_id=v_old_day.id
    order by pe.sort_order;

    insert into public.program_cardio_blocks(
      training_day_id,modality_code,name,sort_order,duration_minutes,target_hr_min,target_hr_max,
      target_rpe_min,target_rpe_max,speed_kmh,incline_percent,distance_km,notes
    )
    select v_new_day,pcb.modality_code,pcb.name,pcb.sort_order,pcb.duration_minutes,pcb.target_hr_min,pcb.target_hr_max,
      pcb.target_rpe_min,pcb.target_rpe_max,pcb.speed_kmh,pcb.incline_percent,pcb.distance_km,pcb.notes
    from public.program_cardio_blocks pcb
    where pcb.training_day_id=v_old_day.id
    order by pcb.sort_order;
  end loop;

  return v_new_program;
end;
$$;

revoke all on function public.clone_training_program(uuid) from public,anon;
grant execute on function public.clone_training_program(uuid) to authenticated;
