-- Pilot runtime fixes found during end-to-end interaction audit.
-- Keeps the deployed database reproducible from migrations.

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

  perform pg_advisory_xact_lock(hashtext(v_user::text));

  select ws.id into v_existing
  from public.workout_sessions ws
  where ws.client_id=v_user and ws.status='in_progress'
  order by ws.started_at desc
  limit 1;
  if v_existing is not null then return v_existing; end if;

  select td.* into v_day
  from public.training_days td
  join public.training_programs tp on tp.id=td.program_id
  where td.id=p_training_day_id
    and tp.client_id=v_user
    and tp.status='active'
    and tp.is_active=true;
  if not found then raise exception 'Active session not available for this client'; end if;

  select * into v_program
  from public.training_programs
  where id=v_day.program_id;

  insert into public.workout_sessions(
    client_id,training_day_id,program_id,status,started_at,updated_at,
    program_name_snapshot,program_description_snapshot,program_version_snapshot,program_family_id_snapshot,
    training_day_name_snapshot,session_type_snapshot,planned_duration_minutes_snapshot,training_day_notes_snapshot
  ) values (
    v_user,v_day.id,v_program.id,'in_progress',now(),now(),
    v_program.name,v_program.description,v_program.version,v_program.family_id,
    v_day.name,v_day.session_type,v_day.planned_duration_minutes,v_day.notes
  )
  returning id into v_session_id;

  insert into public.workout_exercises(
    workout_session_id,program_exercise_id,exercise_id,prescribed_exercise_id,prescribed_exercise_name_snapshot,
    exercise_name_snapshot,instructions_snapshot,technique_url_snapshot,primary_muscle_snapshot,
    image_storage_path_snapshot,image_external_url_snapshot,sort_order,superset_group,superset_position,
    prescribed_sets,reps_min,reps_max,rir_min,rir_max,rir_enabled,rest_seconds,
    allow_substitution,substitution_group_id,substitution_policy,exercise_role,trainer_notes,
    progression_notes_snapshot,warmup_enabled,warmup_load_percent_min,warmup_load_percent_max,
    warmup_reps_min,warmup_reps_max,warmup_rest_seconds,warmup_notes
  )
  select
    v_session_id,pe.id,pe.default_exercise_id,pe.default_exercise_id,e.name,
    e.name,e.instructions,e.technique_url,
    (select emg.muscle_group_code
       from public.exercise_muscle_groups emg
      where emg.exercise_id=e.id and emg.role='primary'
      order by emg.muscle_group_code limit 1),
    (select m.storage_path
       from public.exercise_media m
      where m.exercise_id=e.id and m.kind='image'
      order by m.sort_order,m.created_at limit 1),
    (select m.external_url
       from public.exercise_media m
      where m.exercise_id=e.id and m.kind='image'
      order by m.sort_order,m.created_at limit 1),
    pe.sort_order,pe.superset_group,pe.superset_position,
    pe.sets_min,pe.reps_min,pe.reps_max,pe.rir_min,pe.rir_max,pe.rir_enabled,pe.rest_seconds,
    pe.allow_client_substitution,pe.substitution_group_id,pe.substitution_policy,pe.exercise_role,pe.notes,
    pe.progression_notes,pe.warmup_enabled,pe.warmup_load_percent_min,pe.warmup_load_percent_max,
    pe.warmup_reps_min,pe.warmup_reps_max,pe.warmup_rest_seconds,pe.warmup_notes
  from public.program_exercises pe
  join public.exercises e on e.id=pe.default_exercise_id
  where pe.training_day_id=p_training_day_id
  order by pe.sort_order;

  insert into public.workout_cardio_entries(
    workout_session_id,program_cardio_block_id,modality_code,name,sort_order,
    prescribed_duration_minutes,prescribed_hr_min,prescribed_hr_max,prescribed_rpe_min,prescribed_rpe_max,
    prescribed_speed_kmh,prescribed_incline_percent,prescribed_distance_km,trainer_notes
  )
  select
    v_session_id,pcb.id,pcb.modality_code,pcb.name,pcb.sort_order,
    pcb.duration_minutes,pcb.target_hr_min,pcb.target_hr_max,pcb.target_rpe_min,pcb.target_rpe_max,
    pcb.speed_kmh,pcb.incline_percent,pcb.distance_km,pcb.notes
  from public.program_cardio_blocks pcb
  where pcb.training_day_id=p_training_day_id
  order by pcb.sort_order;

  return v_session_id;
end;
$$;

revoke all on function public.start_workout(uuid) from public,anon;
grant execute on function public.start_workout(uuid) to authenticated;

grant delete on table public.client_task_completions to authenticated;

alter table public.reminder_rules
  drop constraint if exists reminder_rules_channel_check;
alter table public.reminder_rules
  add constraint reminder_rules_channel_check
  check (channel = any (array['telegram'::text,'email'::text,'webpush'::text,'in_app'::text]));

revoke all on function public.reply_to_feedback(uuid,text) from public,anon;
grant execute on function public.reply_to_feedback(uuid,text) to authenticated;
