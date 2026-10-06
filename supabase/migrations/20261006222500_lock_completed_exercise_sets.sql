create or replace function public.save_workout_set(
  p_workout_exercise_id uuid,p_set_number integer,p_weight_kg numeric,p_reps integer,
  p_rir numeric,p_is_warmup boolean,p_completed_at timestamptz
) returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_row public.workout_sets%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists(
    select 1
    from public.workout_exercises we
    join public.workout_sessions ws on ws.id=we.workout_session_id
    where we.id=p_workout_exercise_id
      and ws.client_id=auth.uid()
      and ws.status='in_progress'
      and we.completed_at is null
  ) then
    raise exception 'Editable workout exercise not found or access denied';
  end if;
  if p_set_number<0
     or (p_is_warmup and p_set_number<>0)
     or (not p_is_warmup and p_set_number=0) then
    raise exception 'Invalid set number';
  end if;

  insert into public.workout_sets(
    workout_exercise_id,set_number,weight_kg,reps,rir,is_warmup,completed_at
  )
  values(
    p_workout_exercise_id,p_set_number,p_weight_kg,p_reps,p_rir,p_is_warmup,p_completed_at
  )
  on conflict(workout_exercise_id,set_number) do update set
    weight_kg=excluded.weight_kg,
    reps=excluded.reps,
    rir=excluded.rir,
    is_warmup=excluded.is_warmup,
    completed_at=excluded.completed_at
  returning * into v_row;

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

create or replace function public.delete_my_workout_set(
  p_workout_exercise_id uuid,
  p_set_number integer
) returns boolean
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_deleted boolean:=false;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_set_number<0 then raise exception 'Invalid set number'; end if;

  if not exists(
    select 1
    from public.workout_exercises we
    join public.workout_sessions ws on ws.id=we.workout_session_id
    where we.id=p_workout_exercise_id
      and ws.client_id=auth.uid()
      and ws.status='in_progress'
      and we.completed_at is null
  ) then
    raise exception 'Editable workout exercise not found or access denied';
  end if;

  delete from public.workout_sets
  where workout_exercise_id=p_workout_exercise_id
    and set_number=p_set_number;

  v_deleted:=found;
  return v_deleted;
end;
$$;
