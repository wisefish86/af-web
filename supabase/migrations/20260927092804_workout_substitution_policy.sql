
alter table public.workout_exercises
  add column if not exists substitution_policy text not null default 'strict';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.workout_exercises'::regclass
      and conname='workout_exercises_substitution_policy_check'
  ) then
    alter table public.workout_exercises
      add constraint workout_exercises_substitution_policy_check
      check (substitution_policy in ('strict','flexible','wide'));
  end if;
end $$;

create or replace function public.start_workout(p_training_day_id uuid)
returns uuid
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_program_id uuid;
  v_session_id uuid;
  v_existing uuid;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  select td.program_id into v_program_id
  from public.training_days td
  join public.training_programs tp on tp.id=td.program_id
  where td.id=p_training_day_id
    and tp.client_id=v_user
    and tp.status='active'
    and tp.is_active=true;

  if not found then
    raise exception 'Active session not available for this client';
  end if;

  select ws.id into v_existing
  from public.workout_sessions ws
  where ws.client_id=v_user
    and ws.training_day_id=p_training_day_id
    and ws.status='in_progress'
  order by ws.started_at desc
  limit 1;

  if v_existing is not null then
    return v_existing;
  end if;

  insert into public.workout_sessions(client_id,training_day_id,program_id,status,started_at,updated_at)
  values(v_user,p_training_day_id,v_program_id,'in_progress',now(),now())
  returning id into v_session_id;

  insert into public.workout_exercises(
    workout_session_id,program_exercise_id,exercise_id,sort_order,
    prescribed_sets,reps_min,reps_max,rir_min,rir_max,rir_enabled,
    rest_seconds,allow_substitution,substitution_group_id,substitution_policy,
    exercise_role,trainer_notes
  )
  select
    v_session_id,pe.id,pe.default_exercise_id,pe.sort_order,
    pe.sets_min,pe.reps_min,pe.reps_max,pe.rir_min,pe.rir_max,pe.rir_enabled,
    pe.rest_seconds,pe.allow_client_substitution,pe.substitution_group_id,
    pe.substitution_policy,pe.exercise_role,pe.notes
  from public.program_exercises pe
  where pe.training_day_id=p_training_day_id
  order by pe.sort_order;

  insert into public.workout_cardio_entries(
    workout_session_id,program_cardio_block_id,modality_code,name,sort_order,
    prescribed_duration_minutes,prescribed_hr_min,prescribed_hr_max,
    prescribed_rpe_min,prescribed_rpe_max,prescribed_speed_kmh,
    prescribed_incline_percent,prescribed_distance_km,trainer_notes
  )
  select
    v_session_id,pcb.id,pcb.modality_code,pcb.name,pcb.sort_order,
    pcb.duration_minutes,pcb.target_hr_min,pcb.target_hr_max,
    pcb.target_rpe_min,pcb.target_rpe_max,pcb.speed_kmh,
    pcb.incline_percent,pcb.distance_km,pcb.notes
  from public.program_cardio_blocks pcb
  where pcb.training_day_id=p_training_day_id
  order by pcb.sort_order;

  return v_session_id;
end;
$$;

create or replace function public.get_allowed_workout_substitutions(p_workout_exercise_id uuid)
returns table(exercise_id uuid, name text, match_type text)
language plpgsql
security invoker
set search_path=public,pg_temp
stable
as $$
declare
  v_group uuid;
  v_parent uuid;
  v_policy text;
  v_current uuid;
begin
  select we.substitution_group_id,we.substitution_policy,we.exercise_id,g.parent_group_id
  into v_group,v_policy,v_current,v_parent
  from public.workout_exercises we
  join public.workout_sessions ws on ws.id=we.workout_session_id
  left join public.exercise_substitution_groups g on g.id=we.substitution_group_id
  where we.id=p_workout_exercise_id
    and we.allow_substitution=true
    and (
      ws.client_id=(select auth.uid())
      or exists (
        select 1 from public.coach_clients cc
        where cc.client_id=ws.client_id
          and cc.coach_id=(select auth.uid())
          and cc.status='active'
      )
    );

  if not found or v_group is null then
    return;
  end if;

  return query
  select distinct on (e.id)
    e.id,
    e.name,
    m.match_type
  from public.exercise_substitution_members m
  join public.exercises e on e.id=m.exercise_id and e.is_active=true
  where e.id<>v_current
    and (
      (v_policy='strict' and m.group_id=v_group and m.match_type='direct')
      or
      (v_policy='flexible' and m.group_id=v_group and m.match_type in ('direct','acceptable'))
      or
      (v_policy='wide' and (m.group_id=v_group or (v_parent is not null and m.group_id=v_parent)))
    )
  order by e.id,
    case m.match_type when 'direct' then 1 when 'acceptable' then 2 else 3 end,
    m.priority,
    e.name;
end;
$$;

create or replace function public.replace_workout_exercise(
  p_workout_exercise_id uuid,
  p_new_exercise_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_current uuid;
begin
  select we.exercise_id into v_current
  from public.workout_exercises we
  join public.workout_sessions ws on ws.id=we.workout_session_id
  where we.id=p_workout_exercise_id
    and ws.client_id=(select auth.uid())
    and ws.status='in_progress'
    and we.allow_substitution=true;

  if not found then
    raise exception 'Substitution is not allowed';
  end if;

  if not exists (
    select 1
    from public.get_allowed_workout_substitutions(p_workout_exercise_id) s
    where s.exercise_id=p_new_exercise_id
  ) then
    raise exception 'Exercise is not allowed by the substitution policy';
  end if;

  update public.workout_exercises
  set exercise_id=p_new_exercise_id,
      substituted_from_exercise_id=coalesce(substituted_from_exercise_id,v_current)
  where id=p_workout_exercise_id;

  return p_workout_exercise_id;
end;
$$;

revoke all on function public.get_allowed_workout_substitutions(uuid) from public,anon;
grant execute on function public.get_allowed_workout_substitutions(uuid) to authenticated;
