
alter table public.feedback_threads
  add column if not exists context_key text,
  add column if not exists context_label text;

alter table public.feedback_threads
  drop constraint if exists feedback_threads_context_type_check;

alter table public.feedback_threads
  add constraint feedback_threads_context_type_check
  check(context_type in ('workout_exercise','workout','daily_checkin','monthly_checkin','general'));

create unique index if not exists feedback_threads_client_context_uq
  on public.feedback_threads(client_id,context_type,context_key)
  where context_key is not null and context_type in ('workout','daily_checkin','monthly_checkin');

create or replace function private.sync_client_feedback_comment(
  p_client_id uuid,
  p_context_type text,
  p_context_key text,
  p_context_label text,
  p_body text,
  p_workout_session_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $function$
declare
  v_body text:=nullif(btrim(p_body),'');
  v_thread uuid;
  v_last_client_body text;
  v_coach uuid;
begin
  if v_body is null then return null; end if;
  if p_client_id is null then raise exception 'Client id required'; end if;
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
  where ft.client_id=p_client_id
    and ft.context_type=p_context_type
    and ft.context_key=p_context_key
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

  if v_last_client_body is not distinct from v_body then
    return v_thread;
  end if;

  insert into public.feedback_messages(thread_id,author_id,body)
  values(v_thread,p_client_id,v_body);

  update public.feedback_threads
  set status='new',resolved_at=null,updated_at=now()
  where id=v_thread;

  perform private.enqueue_direct_notification(
    p_client_id,
    v_coach,
    coalesce(nullif(btrim(p_context_label),''),'Комментарий клиента'),
    v_body,
    '/inbox?thread='||v_thread::text,
    jsonb_build_object(
      'kind','feedback',
      'thread_id',v_thread,
      'context_type',p_context_type,
      'context_key',p_context_key,
      'workout_session_id',p_workout_session_id
    )
  );

  return v_thread;
end;
$function$;

revoke all on function private.sync_client_feedback_comment(uuid,text,text,text,text,uuid) from public,anon,authenticated;

create or replace function public.save_my_wellbeing_checkin(
  p_date date,
  p_hunger smallint default null,
  p_energy smallint default null,
  p_stress smallint default null,
  p_sleep smallint default null,
  p_ease smallint default null,
  p_comment text default null
)
returns uuid
language plpgsql
set search_path to 'public','private','pg_temp'
as $function$
declare
  v_user uuid:=auth.uid();
  v_date date:=coalesce(p_date,current_date);
  v_id uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  insert into public.daily_checkins(
    client_id,checkin_date,hunger,energy,stress,sleep,ease,comment
  ) values(
    v_user,v_date,p_hunger,p_energy,p_stress,p_sleep,p_ease,nullif(btrim(p_comment),'')
  )
  on conflict(client_id,checkin_date) do update
  set hunger=excluded.hunger,
      energy=excluded.energy,
      stress=excluded.stress,
      sleep=excluded.sleep,
      ease=excluded.ease,
      comment=excluded.comment
  returning id into v_id;

  perform private.sync_client_feedback_comment(
    v_user,'daily_checkin',v_date::text,'Комментарий к самочувствию',p_comment,null
  );

  return v_id;
end;
$function$;

create or replace function public.save_my_monthly_checkin(
  p_date date,
  p_appearance smallint default null,
  p_fitness smallint default null,
  p_physical_comfort smallint default null,
  p_energy smallint default null,
  p_sleep_recovery smallint default null,
  p_nutrition smallint default null,
  p_relationship_with_food smallint default null,
  p_improve text default null,
  p_next_step text default null,
  p_keep text default null,
  p_comment text default null
)
returns uuid
language plpgsql
set search_path to 'public','private','pg_temp'
as $function$
declare
  v_user uuid:=auth.uid();
  v_checkin_date date:=coalesce(p_date,current_date);
  v_id uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  insert into public.monthly_checkins(
    client_id,checkin_date,appearance,fitness,physical_comfort,energy,sleep_recovery,
    nutrition,relationship_with_food,improve,next_step,keep,comment
  ) values(
    v_user,v_checkin_date,p_appearance,p_fitness,p_physical_comfort,p_energy,p_sleep_recovery,
    p_nutrition,p_relationship_with_food,nullif(btrim(p_improve),''),nullif(btrim(p_next_step),''),
    nullif(btrim(p_keep),''),nullif(btrim(p_comment),'')
  )
  on conflict(client_id,checkin_date) do update
  set appearance=excluded.appearance,
      fitness=excluded.fitness,
      physical_comfort=excluded.physical_comfort,
      energy=excluded.energy,
      sleep_recovery=excluded.sleep_recovery,
      nutrition=excluded.nutrition,
      relationship_with_food=excluded.relationship_with_food,
      improve=excluded.improve,
      next_step=excluded.next_step,
      keep=excluded.keep,
      comment=excluded.comment
  returning id into v_id;

  perform private.sync_client_feedback_comment(
    v_user,'monthly_checkin',v_checkin_date::text,'Комментарий к месячному обзору',p_comment,null
  );

  return v_id;
end;
$function$;

create or replace function public.complete_workout(p_workout_session_id uuid,p_comment text default null)
returns uuid
language plpgsql
set search_path to 'public','private','pg_temp'
as $function$
declare
  v_user uuid:=auth.uid();
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  update public.workout_sessions
  set status='completed',completed_at=now(),
      comment=nullif(btrim(p_comment),''),updated_at=now(),
      active_workout_exercise_id=null,rest_timer_end_at=null,rest_timer_name=null
  where id=p_workout_session_id and client_id=v_user and status='in_progress';

  if not found then raise exception 'Workout not found or already completed'; end if;

  perform private.sync_client_feedback_comment(
    v_user,'workout',p_workout_session_id::text,'Комментарий к тренировке',p_comment,p_workout_session_id
  );

  return p_workout_session_id;
end;
$function$;

create or replace function public.reply_to_feedback(p_thread_id uuid,p_body text)
returns uuid
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_user uuid:=auth.uid();
  v_thread public.feedback_threads%rowtype;
  v_id uuid;
  v_recipient uuid;
  v_title text;
  v_action text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if nullif(btrim(p_body),'') is null then raise exception 'Message is empty'; end if;

  select * into v_thread from public.feedback_threads where id=p_thread_id;
  if not found then raise exception 'Thread not found'; end if;

  if v_user<>v_thread.client_id and not exists(
    select 1 from public.coach_clients
    where client_id=v_thread.client_id and coach_id=v_user and status='active'
  ) then raise exception 'Access denied'; end if;

  insert into public.feedback_messages(thread_id,author_id,body)
  values(p_thread_id,v_user,btrim(p_body))
  returning id into v_id;

  update public.feedback_threads
  set status=case when v_user=v_thread.client_id then 'new' else 'in_progress' end,
      assigned_to=case when v_user=v_thread.client_id then assigned_to else v_user end,
      resolved_at=null,
      updated_at=now()
  where id=p_thread_id;

  if v_user=v_thread.client_id then
    select coach_id into v_recipient
    from public.coach_clients
    where client_id=v_thread.client_id and status='active'
    order by started_at desc nulls last
    limit 1;
    v_title:='Новое сообщение клиента';
    v_action:='/inbox?thread='||p_thread_id::text;
  else
    v_recipient:=v_thread.client_id;
    v_title:='Ответ тренера';
    if v_thread.workout_session_id is not null and v_thread.workout_exercise_id is not null then
      v_action:='/workouts?workout='||v_thread.workout_session_id::text||
        '&exercise='||v_thread.workout_exercise_id::text||'&comments=1';
    elsif v_thread.context_type='workout' and v_thread.workout_session_id is not null then
      v_action:='/workouts?workout='||v_thread.workout_session_id::text;
    elsif v_thread.context_type='monthly_checkin' then
      v_action:='/progress';
    elsif v_thread.context_type='daily_checkin' then
      v_action:='/';
    else
      v_action:='/notifications';
    end if;
  end if;

  if v_recipient is not null then
    perform private.enqueue_direct_notification(
      v_thread.client_id,
      v_recipient,
      v_title,
      btrim(p_body),
      v_action,
      jsonb_build_object(
        'kind','feedback',
        'thread_id',p_thread_id,
        'context_type',v_thread.context_type,
        'context_key',v_thread.context_key,
        'workout_session_id',v_thread.workout_session_id,
        'workout_exercise_id',v_thread.workout_exercise_id
      )
    );
  end if;

  return v_id;
end;
$function$;
