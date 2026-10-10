-- One-off cardio blocks added by the client during an active workout.
-- Keep them distinct from trainer-program cardio and retry-safe.

alter table public.workout_cardio_entries
  add column if not exists entry_origin text not null default 'program',
  add column if not exists client_request_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.workout_cardio_entries'::regclass
      and conname='workout_cardio_entries_origin_check'
  ) then
    alter table public.workout_cardio_entries
      add constraint workout_cardio_entries_origin_check
      check (entry_origin in ('program','client_ad_hoc'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.workout_cardio_entries'::regclass
      and conname='workout_cardio_entries_ad_hoc_request_check'
  ) then
    alter table public.workout_cardio_entries
      add constraint workout_cardio_entries_ad_hoc_request_check
      check (
        entry_origin<>'client_ad_hoc'
        or (client_request_id is not null and program_cardio_block_id is null)
      );
  end if;
end $$;

create unique index if not exists workout_cardio_entries_client_request_uq
  on public.workout_cardio_entries(workout_session_id,client_request_id)
  where client_request_id is not null;

create or replace function public.add_my_workout_cardio(
  p_workout_session_id uuid,
  p_request_id uuid,
  p_modality_code text,
  p_duration_minutes integer,
  p_name text default null,
  p_target_hr integer default null,
  p_target_rpe numeric default null,
  p_distance_km numeric default null,
  p_speed_kmh numeric default null,
  p_incline_percent numeric default null
) returns uuid
language plpgsql
security definer
set search_path to pg_catalog, public
as $function$
declare
  v_user uuid:=auth.uid();
  v_existing uuid;
  v_new uuid;
  v_name text:=nullif(btrim(p_name),'');
  v_sort_order integer;
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

  select wc.id into v_existing
  from public.workout_cardio_entries wc
  where wc.workout_session_id=p_workout_session_id
    and wc.client_request_id=p_request_id;

  if v_existing is not null then return v_existing; end if;

  if p_modality_code is null or not exists(
    select 1 from public.cardio_modalities cm where cm.code=p_modality_code
  ) then
    raise exception 'Choose a cardio type';
  end if;
  if p_duration_minutes is null or p_duration_minutes not between 1 and 600 then
    raise exception 'Cardio duration must be between 1 and 600 minutes';
  end if;
  if v_name is not null and char_length(v_name)>120 then
    raise exception 'Cardio name is too long';
  end if;
  if p_target_hr is not null and p_target_hr not between 30 and 250 then
    raise exception 'Target heart rate must be between 30 and 250';
  end if;
  if p_target_rpe is not null and (p_target_rpe<1 or p_target_rpe>10) then
    raise exception 'Target RPE must be between 1 and 10';
  end if;
  if p_distance_km is not null and p_distance_km<0 then
    raise exception 'Distance cannot be negative';
  end if;
  if p_speed_kmh is not null and p_speed_kmh<0 then
    raise exception 'Speed cannot be negative';
  end if;
  if p_incline_percent is not null and p_incline_percent<0 then
    raise exception 'Incline cannot be negative';
  end if;

  select coalesce(max(wc.sort_order),90)+10 into v_sort_order
  from public.workout_cardio_entries wc
  where wc.workout_session_id=p_workout_session_id;

  insert into public.workout_cardio_entries(
    workout_session_id,program_cardio_block_id,modality_code,name,sort_order,
    prescribed_duration_minutes,prescribed_hr_min,prescribed_hr_max,
    prescribed_rpe_min,prescribed_rpe_max,prescribed_speed_kmh,
    prescribed_incline_percent,prescribed_distance_km,
    entry_origin,client_request_id
  ) values (
    p_workout_session_id,null,p_modality_code,v_name,v_sort_order,
    p_duration_minutes,p_target_hr,p_target_hr,
    p_target_rpe,p_target_rpe,p_speed_kmh,
    p_incline_percent,p_distance_km,
    'client_ad_hoc',p_request_id
  )
  returning id into v_new;

  return v_new;
end;
$function$;

revoke all on function public.add_my_workout_cardio(uuid,uuid,text,integer,text,integer,numeric,numeric,numeric,numeric)
  from public,anon;
grant execute on function public.add_my_workout_cardio(uuid,uuid,text,integer,text,integer,numeric,numeric,numeric,numeric)
  to authenticated;
