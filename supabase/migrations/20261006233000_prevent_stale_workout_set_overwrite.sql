-- Prevent stale second-device writes from silently overwriting completed workout sets.
-- Identical retries remain idempotent; changing a completed set requires explicit reopen.

create or replace function public.save_workout_set(
  p_workout_exercise_id uuid,
  p_set_number integer,
  p_weight_kg numeric,
  p_reps integer,
  p_rir numeric,
  p_is_warmup boolean,
  p_completed_at timestamp with time zone
)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public'
as $$
declare
  v_row public.workout_sets%rowtype;
  v_session_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_completed_at is null then raise exception 'Completed timestamp is required'; end if;

  select ws.id
  into v_session_id
  from public.workout_exercises we
  join public.workout_sessions ws on ws.id=we.workout_session_id
  where we.id=p_workout_exercise_id
    and ws.client_id=auth.uid()
    and ws.status='in_progress'
    and we.completed_at is null
  for update of ws;

  if not found then
    raise exception 'Editable workout exercise not found or access denied';
  end if;

  if p_set_number<0
     or (p_is_warmup and p_set_number<>0)
     or (not p_is_warmup and p_set_number=0) then
    raise exception 'Invalid set number';
  end if;

  select *
  into v_row
  from public.workout_sets s
  where s.workout_exercise_id=p_workout_exercise_id
    and s.set_number=p_set_number
  for update;

  if found and v_row.completed_at is not null then
    if v_row.weight_kg is not distinct from p_weight_kg
       and v_row.reps is not distinct from p_reps
       and v_row.rir is not distinct from p_rir
       and v_row.is_warmup is not distinct from p_is_warmup then
      return jsonb_build_object(
        'id',v_row.id,
        'set_number',v_row.set_number,
        'weight_kg',v_row.weight_kg,
        'reps',v_row.reps,
        'rir',v_row.rir,
        'is_warmup',v_row.is_warmup,
        'completed_at',v_row.completed_at
      );
    end if;
    raise exception 'Workout set was changed on another device. Reopen it before editing.';
  end if;

  if found then
    update public.workout_sets
    set weight_kg=p_weight_kg,
        reps=p_reps,
        rir=p_rir,
        is_warmup=p_is_warmup,
        completed_at=p_completed_at
    where id=v_row.id
    returning * into v_row;
  else
    insert into public.workout_sets(
      workout_exercise_id,set_number,weight_kg,reps,rir,is_warmup,completed_at
    )
    values(
      p_workout_exercise_id,p_set_number,p_weight_kg,p_reps,p_rir,p_is_warmup,p_completed_at
    )
    returning * into v_row;
  end if;

  return jsonb_build_object(
    'id',v_row.id,
    'set_number',v_row.set_number,
    'weight_kg',v_row.weight_kg,
    'reps',v_row.reps,
    'rir',v_row.rir,
    'is_warmup',v_row.is_warmup,
    'completed_at',v_row.completed_at
  );
end;
$$;

create or replace function public.complete_workout_v2(
  p_workout_session_id uuid,
  p_comment text default null,
  p_sets jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path='pg_catalog','public'
as $$
declare
  v_user uuid:=auth.uid();
  v_status text;
  v_item jsonb;
  v_exercise_id uuid;
  v_set_number integer;
  v_is_warmup boolean;
  v_completed_at timestamptz;
  v_weight numeric;
  v_reps integer;
  v_rir numeric;
  v_existing public.workout_sets%rowtype;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select ws.status into v_status
  from public.workout_sessions ws
  where ws.id=p_workout_session_id and ws.client_id=v_user
  for update;

  if not found then raise exception 'Workout not found'; end if;
  if v_status='completed' then return p_workout_session_id; end if;
  if v_status<>'in_progress' then raise exception 'Workout cannot be completed'; end if;

  if p_sets is null then p_sets:='[]'::jsonb; end if;
  if jsonb_typeof(p_sets)<>'array' then raise exception 'Invalid set snapshot'; end if;
  if jsonb_array_length(p_sets)>200 then raise exception 'Too many sets in snapshot'; end if;

  for v_item in select value from jsonb_array_elements(p_sets)
  loop
    v_exercise_id:=nullif(v_item->>'workout_exercise_id','')::uuid;
    v_set_number:=nullif(v_item->>'set_number','')::integer;
    v_is_warmup:=coalesce((v_item->>'is_warmup')::boolean,false);
    v_completed_at:=nullif(v_item->>'completed_at','')::timestamptz;
    v_weight:=nullif(v_item->>'weight_kg','')::numeric;
    v_reps:=nullif(v_item->>'reps','')::integer;
    v_rir:=nullif(v_item->>'rir','')::numeric;

    if v_exercise_id is null or v_set_number is null or v_completed_at is null then
      raise exception 'Invalid completed set snapshot';
    end if;
    if v_set_number<0
       or (v_is_warmup and v_set_number<>0)
       or (not v_is_warmup and v_set_number=0) then
      raise exception 'Invalid set number';
    end if;
    if not exists(
      select 1 from public.workout_exercises we
      where we.id=v_exercise_id and we.workout_session_id=p_workout_session_id
    ) then
      raise exception 'Set does not belong to workout';
    end if;

    select *
    into v_existing
    from public.workout_sets s
    where s.workout_exercise_id=v_exercise_id
      and s.set_number=v_set_number
    for update;

    if found and v_existing.completed_at is not null then
      if v_existing.weight_kg is distinct from v_weight
         or v_existing.reps is distinct from v_reps
         or v_existing.rir is distinct from v_rir
         or v_existing.is_warmup is distinct from v_is_warmup then
        raise exception 'Workout set was changed on another device. Reload before completing the workout.';
      end if;
      continue;
    end if;

    if found then
      update public.workout_sets
      set weight_kg=v_weight,
          reps=v_reps,
          rir=v_rir,
          is_warmup=v_is_warmup,
          completed_at=v_completed_at
      where id=v_existing.id;
    else
      insert into public.workout_sets(
        workout_exercise_id,set_number,weight_kg,reps,rir,is_warmup,completed_at
      )
      values(
        v_exercise_id,v_set_number,v_weight,v_reps,v_rir,v_is_warmup,v_completed_at
      );
    end if;
  end loop;

  update public.workout_sessions
  set status='completed',completed_at=now(),
      comment=nullif(btrim(p_comment),''),
      updated_at=now(),
      active_workout_exercise_id=null,
      rest_timer_end_at=null,
      rest_timer_name=null
  where id=p_workout_session_id and client_id=v_user;

  if nullif(btrim(p_comment),'') is not null then
    begin
      perform private.sync_client_feedback_comment(
        v_user,'workout',p_workout_session_id::text,
        'Комментарий к тренировке',p_comment,p_workout_session_id
      );
    exception when others then
      raise warning 'Workout completed but feedback sync failed: %',sqlerrm;
    end;
  end if;

  return p_workout_session_id;
end;
$$;
