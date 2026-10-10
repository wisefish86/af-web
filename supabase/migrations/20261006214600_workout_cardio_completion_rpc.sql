create or replace function public.complete_my_workout_cardio(
  p_workout_cardio_entry_id uuid,
  p_actual_duration_minutes integer,
  p_actual_hr_avg integer default null,
  p_actual_rpe numeric default null,
  p_actual_distance_km numeric default null,
  p_client_notes text default null
) returns timestamptz
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_row public.workout_cardio_entries%rowtype;
  v_notes text:=nullif(btrim(p_client_notes),'');
  v_completed timestamptz;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_actual_duration_minutes is null or p_actual_duration_minutes not between 1 and 600 then
    raise exception 'Cardio duration must be between 1 and 600 minutes';
  end if;
  if p_actual_hr_avg is not null and p_actual_hr_avg not between 30 and 250 then
    raise exception 'Average heart rate must be between 30 and 250';
  end if;
  if p_actual_rpe is not null and (p_actual_rpe<1 or p_actual_rpe>10) then
    raise exception 'RPE must be between 1 and 10';
  end if;
  if p_actual_distance_km is not null and p_actual_distance_km<0 then
    raise exception 'Distance cannot be negative';
  end if;
  if v_notes is not null and char_length(v_notes)>2000 then
    raise exception 'Cardio note is too long';
  end if;

  select wc.* into v_row
  from public.workout_cardio_entries wc
  join public.workout_sessions ws on ws.id=wc.workout_session_id
  where wc.id=p_workout_cardio_entry_id
    and ws.client_id=v_user
    and ws.status='in_progress'
  for update of wc;

  if not found then raise exception 'Editable cardio result not found or access denied'; end if;

  if v_row.completed_at is not null then
    if v_row.actual_duration_minutes is not distinct from p_actual_duration_minutes
       and v_row.actual_hr_avg is not distinct from p_actual_hr_avg
       and v_row.actual_rpe is not distinct from p_actual_rpe
       and v_row.actual_distance_km is not distinct from p_actual_distance_km
       and nullif(btrim(v_row.client_notes),'') is not distinct from v_notes then
      return v_row.completed_at;
    end if;
    raise exception 'Cardio result is already completed; reopen it before changing values';
  end if;

  v_completed:=now();
  update public.workout_cardio_entries
  set actual_duration_minutes=p_actual_duration_minutes,
      actual_hr_avg=p_actual_hr_avg,
      actual_rpe=p_actual_rpe,
      actual_distance_km=p_actual_distance_km,
      client_notes=v_notes,
      completed_at=v_completed
  where id=p_workout_cardio_entry_id;

  return v_completed;
end;
$$;

revoke all on function public.complete_my_workout_cardio(uuid,integer,integer,numeric,numeric,text) from public,anon;
grant execute on function public.complete_my_workout_cardio(uuid,integer,integer,numeric,numeric,text) to authenticated;
