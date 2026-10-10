create or replace function public.complete_workout_v2(
  p_workout_session_id uuid,
  p_comment text default null,
  p_sets jsonb default '[]'::jsonb
) returns uuid
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_status text;
  v_item jsonb;
  v_exercise_id uuid;
  v_set_number integer;
  v_is_warmup boolean;
  v_completed_at timestamptz;
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

    insert into public.workout_sets(
      workout_exercise_id,set_number,weight_kg,reps,rir,is_warmup,completed_at
    ) values(
      v_exercise_id,
      v_set_number,
      nullif(v_item->>'weight_kg','')::numeric,
      nullif(v_item->>'reps','')::integer,
      nullif(v_item->>'rir','')::numeric,
      v_is_warmup,
      v_completed_at
    )
    on conflict(workout_exercise_id,set_number) do update set
      weight_kg=excluded.weight_kg,
      reps=excluded.reps,
      rir=excluded.rir,
      is_warmup=excluded.is_warmup,
      completed_at=excluded.completed_at;
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

revoke execute on function public.complete_workout_v2(uuid,text,jsonb) from public,anon;
grant execute on function public.complete_workout_v2(uuid,text,jsonb) to authenticated;
