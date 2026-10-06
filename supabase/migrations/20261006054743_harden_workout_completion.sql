create or replace function private.sync_client_feedback_comment(
  p_client_id uuid,
  p_context_type text,
  p_context_key text,
  p_context_label text,
  p_body text,
  p_workout_session_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_body text:=nullif(btrim(p_body),'');
  v_thread uuid;
  v_last_client_body text;
  v_coach uuid;
begin
  if auth.uid() is null or auth.uid() is distinct from p_client_id then
    raise exception 'Access denied';
  end if;
  if v_body is null then return null; end if;
  if p_context_type not in ('workout','daily_checkin','monthly_checkin') then
    raise exception 'Unsupported feedback context';
  end if;
  if nullif(btrim(p_context_key),'') is null then raise exception 'Context key required'; end if;

  select cc.coach_id into v_coach
  from public.coach_clients cc
  where cc.client_id=p_client_id and cc.status='active'
  order by cc.started_at desc nulls last
  limit 1;

  if v_coach is null then return null; end if;

  select ft.id into v_thread
  from public.feedback_threads ft
  where ft.client_id=p_client_id and ft.context_type=p_context_type and ft.context_key=p_context_key
  limit 1
  for update;

  if v_thread is null then
    insert into public.feedback_threads(
      client_id,workout_session_id,workout_exercise_id,
      context_type,context_key,context_label,status,created_by,created_at,updated_at
    ) values(
      p_client_id,p_workout_session_id,null,
      p_context_type,p_context_key,nullif(btrim(p_context_label),''),
      'new',p_client_id,now(),now()
    )
    returning id into v_thread;
  else
    update public.feedback_threads
    set context_label=coalesce(nullif(btrim(p_context_label),''),context_label),
        workout_session_id=coalesce(p_workout_session_id,workout_session_id)
    where id=v_thread;
  end if;

  select fm.body into v_last_client_body
  from public.feedback_messages fm
  where fm.thread_id=v_thread and fm.author_id=p_client_id
  order by fm.created_at desc
  limit 1;

  if v_last_client_body is not distinct from v_body then return v_thread; end if;

  insert into public.feedback_messages(thread_id,author_id,body)
  values(v_thread,p_client_id,v_body);

  update public.feedback_threads
  set status='new',resolved_at=null,updated_at=now()
  where id=v_thread;

  perform private.enqueue_direct_notification(
    p_client_id,v_coach,
    coalesce(nullif(btrim(p_context_label),''),'Комментарий клиента'),
    v_body,
    '/inbox?thread='||v_thread::text,
    jsonb_build_object(
      'kind','feedback','thread_id',v_thread,'context_type',p_context_type,
      'context_key',p_context_key,'workout_session_id',p_workout_session_id
    )
  );

  return v_thread;
end;
$$;

revoke all on function private.sync_client_feedback_comment(uuid,text,text,text,text,uuid) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.sync_client_feedback_comment(uuid,text,text,text,text,uuid) to authenticated;

create or replace function public.complete_workout(
  p_workout_session_id uuid,
  p_comment text default null
) returns uuid
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  update public.workout_sessions
  set status='completed',completed_at=now(),
      comment=nullif(btrim(p_comment),''),
      updated_at=now(),
      active_workout_exercise_id=null,
      rest_timer_end_at=null,
      rest_timer_name=null
  where id=p_workout_session_id and client_id=v_user and status='in_progress';

  if not found then raise exception 'Workout not found or already completed'; end if;

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

revoke execute on function public.complete_workout(uuid,text) from public,anon;
grant execute on function public.complete_workout(uuid,text) to authenticated;

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
  v_item jsonb;
  v_exercise_id uuid;
  v_set_number integer;
  v_is_warmup boolean;
  v_completed_at timestamptz;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  if not exists(
    select 1 from public.workout_sessions ws
    where ws.id=p_workout_session_id and ws.client_id=v_user and ws.status='in_progress'
  ) then raise exception 'Workout not found or already completed'; end if;

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
  where id=p_workout_session_id and client_id=v_user and status='in_progress';

  if not found then raise exception 'Workout not found or already completed'; end if;

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
