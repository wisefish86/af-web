-- Pilot hardening: immutable workout history, complete assignment snapshots,
-- atomic set writes and recommendation-only load progression.

alter table public.workout_sessions
  add column if not exists program_name_snapshot text,
  add column if not exists program_description_snapshot text,
  add column if not exists program_version_snapshot integer,
  add column if not exists program_family_id_snapshot uuid,
  add column if not exists training_day_name_snapshot text,
  add column if not exists session_type_snapshot text,
  add column if not exists planned_duration_minutes_snapshot integer,
  add column if not exists training_day_notes_snapshot text;

alter table public.workout_exercises
  add column if not exists progression_notes_snapshot text;

-- Existing rows are backfilled without overwriting any previously captured value.
update public.workout_sessions ws
set program_name_snapshot=coalesce(ws.program_name_snapshot,tp.name),
    program_description_snapshot=coalesce(ws.program_description_snapshot,tp.description),
    program_version_snapshot=coalesce(ws.program_version_snapshot,tp.version),
    program_family_id_snapshot=coalesce(ws.program_family_id_snapshot,tp.family_id),
    training_day_name_snapshot=coalesce(ws.training_day_name_snapshot,td.name),
    session_type_snapshot=coalesce(ws.session_type_snapshot,td.session_type),
    planned_duration_minutes_snapshot=coalesce(ws.planned_duration_minutes_snapshot,td.planned_duration_minutes),
    training_day_notes_snapshot=coalesce(ws.training_day_notes_snapshot,td.notes)
from public.training_programs tp, public.training_days td
where tp.id=ws.program_id and td.id=ws.training_day_id;

update public.workout_exercises we
set progression_notes_snapshot=pe.progression_notes
from public.program_exercises pe
where pe.id=we.program_exercise_id
  and we.progression_notes_snapshot is null;

create or replace function public.start_workout(p_training_day_id uuid)
returns uuid
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_day public.training_days%rowtype;
  v_program public.training_programs%rowtype;
  v_session_id uuid;
  v_existing uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select td.* into v_day
  from public.training_days td
  join public.training_programs tp on tp.id=td.program_id
  where td.id=p_training_day_id
    and tp.client_id=v_user and tp.status='active' and tp.is_active=true;
  if not found then raise exception 'Active session not available for this client'; end if;

  select * into v_program from public.training_programs where id=v_day.program_id;

  select ws.id into v_existing
  from public.workout_sessions ws
  where ws.client_id=v_user and ws.training_day_id=p_training_day_id and ws.status='in_progress'
  order by ws.started_at desc limit 1;
  if v_existing is not null then return v_existing; end if;

  insert into public.workout_sessions(
    client_id,training_day_id,program_id,status,started_at,updated_at,
    program_name_snapshot,program_description_snapshot,program_version_snapshot,program_family_id_snapshot,
    training_day_name_snapshot,session_type_snapshot,planned_duration_minutes_snapshot,training_day_notes_snapshot
  ) values (
    v_user,v_day.id,v_program.id,'in_progress',now(),now(),
    v_program.name,v_program.description,v_program.version,v_program.family_id,
    v_day.name,v_day.session_type,v_day.planned_duration_minutes,v_day.notes
  ) returning id into v_session_id;

  insert into public.workout_exercises(
    workout_session_id,program_exercise_id,exercise_id,prescribed_exercise_id,sort_order,
    prescribed_sets,reps_min,reps_max,rir_min,rir_max,rir_enabled,rest_seconds,
    allow_substitution,substitution_group_id,substitution_policy,exercise_role,trainer_notes,
    progression_notes_snapshot,prescribed_exercise_name_snapshot,exercise_name_snapshot,
    instructions_snapshot,technique_url_snapshot,primary_muscle_snapshot,
    image_storage_path_snapshot,image_external_url_snapshot
  )
  select v_session_id,pe.id,pe.default_exercise_id,pe.default_exercise_id,pe.sort_order,
    pe.sets_min,pe.reps_min,pe.reps_max,pe.rir_min,pe.rir_max,pe.rir_enabled,pe.rest_seconds,
    pe.allow_client_substitution,pe.substitution_group_id,pe.substitution_policy,pe.exercise_role,pe.notes,
    pe.progression_notes,e.name,e.name,e.instructions,e.technique_url,
    (select emg.muscle_group_code from public.exercise_muscle_groups emg
      where emg.exercise_id=e.id and emg.role='primary' order by emg.muscle_group_code limit 1),
    (select m.storage_path from public.exercise_media m
      where m.exercise_id=e.id and m.kind='image' order by m.sort_order,m.created_at limit 1),
    (select m.external_url from public.exercise_media m
      where m.exercise_id=e.id and m.kind='image' order by m.sort_order,m.created_at limit 1)
  from public.program_exercises pe join public.exercises e on e.id=pe.default_exercise_id
  where pe.training_day_id=p_training_day_id order by pe.sort_order;

  insert into public.workout_cardio_entries(
    workout_session_id,program_cardio_block_id,modality_code,name,sort_order,
    prescribed_duration_minutes,prescribed_hr_min,prescribed_hr_max,prescribed_rpe_min,
    prescribed_rpe_max,prescribed_speed_kmh,prescribed_incline_percent,
    prescribed_distance_km,trainer_notes
  )
  select v_session_id,pcb.id,pcb.modality_code,pcb.name,pcb.sort_order,
    pcb.duration_minutes,pcb.target_hr_min,pcb.target_hr_max,pcb.target_rpe_min,
    pcb.target_rpe_max,pcb.speed_kmh,pcb.incline_percent,pcb.distance_km,pcb.notes
  from public.program_cardio_blocks pcb
  where pcb.training_day_id=p_training_day_id order by pcb.sort_order;

  return v_session_id;
end;
$$;

revoke all on function public.start_workout(uuid) from public,anon;
grant execute on function public.start_workout(uuid) to authenticated;

create or replace function public.guard_completed_workout_session()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if old.status='completed' then
    raise exception 'Completed workout history is immutable';
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_guard_completed_workout_session on public.workout_sessions;
create trigger trg_guard_completed_workout_session
before update or delete on public.workout_sessions
for each row execute function public.guard_completed_workout_session();

create or replace function public.guard_completed_workout_child()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_session_id uuid; v_status text;
begin
  if tg_table_name in ('workout_exercises','workout_cardio_entries') then
    v_session_id:=case when tg_op='DELETE' then old.workout_session_id else new.workout_session_id end;
  elsif tg_table_name='workout_sets' then
    select we.workout_session_id into v_session_id from public.workout_exercises we
    where we.id=case when tg_op='DELETE' then old.workout_exercise_id else new.workout_exercise_id end;
  end if;
  select status into v_status from public.workout_sessions where id=v_session_id;
  if v_status='completed' then raise exception 'Completed workout history is immutable'; end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_guard_completed_workout_exercise on public.workout_exercises;
create trigger trg_guard_completed_workout_exercise before insert or update or delete on public.workout_exercises
for each row execute function public.guard_completed_workout_child();
drop trigger if exists trg_guard_completed_workout_set on public.workout_sets;
create trigger trg_guard_completed_workout_set before insert or update or delete on public.workout_sets
for each row execute function public.guard_completed_workout_child();
drop trigger if exists trg_guard_completed_workout_cardio on public.workout_cardio_entries;
create trigger trg_guard_completed_workout_cardio before insert or update or delete on public.workout_cardio_entries
for each row execute function public.guard_completed_workout_child();

create or replace function public.save_workout_set(
  p_workout_exercise_id uuid,p_set_number integer,p_weight_kg numeric,p_reps integer,
  p_rir numeric,p_is_warmup boolean,p_completed_at timestamptz
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_row public.workout_sets%rowtype;
begin
  if not exists(
    select 1 from public.workout_exercises we join public.workout_sessions ws on ws.id=we.workout_session_id
    where we.id=p_workout_exercise_id and ws.client_id=auth.uid() and ws.status='in_progress'
  ) then raise exception 'In-progress workout exercise not found or access denied'; end if;
  if p_set_number<0 or (p_is_warmup and p_set_number<>0) or (not p_is_warmup and p_set_number=0) then
    raise exception 'Invalid set number';
  end if;
  insert into public.workout_sets(workout_exercise_id,set_number,weight_kg,reps,rir,is_warmup,completed_at)
  values(p_workout_exercise_id,p_set_number,p_weight_kg,p_reps,p_rir,p_is_warmup,p_completed_at)
  on conflict(workout_exercise_id,set_number) do update set
    weight_kg=excluded.weight_kg,reps=excluded.reps,rir=excluded.rir,
    is_warmup=excluded.is_warmup,completed_at=excluded.completed_at
  returning * into v_row;
  return jsonb_build_object('id',v_row.id,'set_number',v_row.set_number,'weight_kg',v_row.weight_kg,
    'reps',v_row.reps,'rir',v_row.rir,'is_warmup',v_row.is_warmup,'completed_at',v_row.completed_at);
end;
$$;

revoke all on function public.save_workout_set(uuid,integer,numeric,integer,numeric,boolean,timestamptz) from public,anon;
grant execute on function public.save_workout_set(uuid,integer,numeric,integer,numeric,boolean,timestamptz) to authenticated;

create or replace function public.get_workout_load_recommendation(p_workout_exercise_id uuid)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
with current_exercise as (
  select we.*,ws.client_id,ws.started_at
  from public.workout_exercises we join public.workout_sessions ws on ws.id=we.workout_session_id
  where we.id=p_workout_exercise_id and ws.client_id=auth.uid()
), previous_exercise as (
  select prev_we.id
  from current_exercise c
  join public.workout_exercises prev_we on prev_we.exercise_id=c.exercise_id
  join public.workout_sessions prev_ws on prev_ws.id=prev_we.workout_session_id
  where prev_ws.client_id=c.client_id and prev_ws.status='completed' and prev_ws.completed_at<c.started_at
  order by prev_ws.completed_at desc limit 1
), result as (
  select max(s.weight_kg) current_weight,count(*) completed_sets,
    bool_and(c.reps_max is not null and s.reps>=c.reps_max) hit_top_reps,
    bool_and(not c.rir_enabled or (s.rir is not null and s.rir>=coalesce(c.rir_min,0))) respected_rir,
    max(c.prescribed_sets) prescribed_sets
  from current_exercise c cross join previous_exercise p
  join public.workout_sets s on s.workout_exercise_id=p.id
  where not s.is_warmup and s.completed_at is not null
)
select case when current_weight is null then jsonb_build_object(
    'suggested_weight_kg',null,'previous_weight_kg',null,'reason','Недостаточно прошлых данных')
  when completed_sets>=prescribed_sets and hit_top_reps and respected_rir then jsonb_build_object(
    'suggested_weight_kg',case when current_weight<30 then ceil((current_weight+1)*2)/2
      when current_weight<80 then ceil((current_weight+2.5)*2)/2 else ceil((current_weight+5)*2)/2 end,
    'previous_weight_kg',current_weight,'reason','Все рабочие подходы достигли верхней границы повторений с заданным запасом. Это рекомендация, не обязательное повышение.')
  else jsonb_build_object('suggested_weight_kg',current_weight,'previous_weight_kg',current_weight,
    'reason','Сохранить прежний вес: критерии повышения пока не выполнены.') end
from result;
$$;

revoke all on function public.get_workout_load_recommendation(uuid) from public,anon;
grant execute on function public.get_workout_load_recommendation(uuid) to authenticated;

-- Completion remains a single transaction and becomes the irreversible history boundary.
create or replace function public.complete_workout(p_workout_session_id uuid,p_comment text default null)
returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  update public.workout_sessions set status='completed',completed_at=now(),
    comment=nullif(btrim(p_comment),''),updated_at=now()
  where id=p_workout_session_id and client_id=auth.uid() and status='in_progress';
  if not found then raise exception 'Workout not found or already completed'; end if;
  return p_workout_session_id;
end;
$$;

revoke all on function public.complete_workout(uuid,text) from public,anon;
grant execute on function public.complete_workout(uuid,text) to authenticated;

