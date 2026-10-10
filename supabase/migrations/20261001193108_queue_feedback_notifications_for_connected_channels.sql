
create or replace function private.enqueue_direct_notification(
  p_client_id uuid,
  p_recipient_id uuid,
  p_title text,
  p_body text,
  p_action_path text,
  p_payload jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $function$
declare
  v_in_app boolean:=true;
  v_telegram boolean:=false;
begin
  select coalesce(np.in_app_enabled,true),coalesce(np.telegram_enabled,false)
    into v_in_app,v_telegram
  from public.notification_preferences np
  where np.user_id=p_recipient_id;

  if not found then
    v_in_app:=true;
    v_telegram:=false;
  end if;

  if v_in_app then
    insert into public.notification_deliveries(
      client_id,recipient_id,channel,scheduled_for,sent_at,status,title,body,action_path,payload,delivered_at
    ) values(
      p_client_id,p_recipient_id,'in_app',now(),now(),'sent',p_title,left(coalesce(p_body,''),240),
      p_action_path,coalesce(p_payload,'{}'::jsonb),now()
    );
  end if;

  if v_telegram and exists(
    select 1
    from public.notification_channels nc
    where nc.client_id=p_recipient_id
      and nc.channel='telegram'
      and nc.enabled=true
      and nc.verified_at is not null
      and nullif(nc.external_id,'') is not null
  ) then
    insert into public.notification_deliveries(
      client_id,recipient_id,channel,scheduled_for,status,title,body,action_path,payload
    ) values(
      p_client_id,p_recipient_id,'telegram',now(),'pending',p_title,left(coalesce(p_body,''),240),
      p_action_path,coalesce(p_payload,'{}'::jsonb)
    );
  end if;
end;
$function$;

revoke all on function private.enqueue_direct_notification(uuid,uuid,text,text,text,jsonb) from public,anon,authenticated;

create or replace function public.add_workout_comment(p_workout_exercise_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_user uuid:=auth.uid();
  v_session uuid;
  v_thread uuid;
  v_coach uuid;
  v_action text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if nullif(btrim(p_body),'') is null then raise exception 'Message is empty'; end if;

  select we.workout_session_id into v_session
  from public.workout_exercises we
  join public.workout_sessions ws on ws.id=we.workout_session_id
  where we.id=p_workout_exercise_id and ws.client_id=v_user;
  if not found then raise exception 'Workout exercise not found'; end if;

  select id into v_thread
  from public.feedback_threads
  where client_id=v_user and workout_exercise_id=p_workout_exercise_id and status<>'resolved'
  order by created_at desc limit 1;

  if v_thread is null then
    insert into public.feedback_threads(
      client_id,workout_session_id,workout_exercise_id,context_type,status,created_by,created_at,updated_at
    ) values(
      v_user,v_session,p_workout_exercise_id,'workout_exercise','new',v_user,now(),now()
    )
    returning id into v_thread;
  end if;

  insert into public.feedback_messages(thread_id,author_id,body)
  values(v_thread,v_user,btrim(p_body));

  update public.feedback_threads
  set status='new',resolved_at=null,updated_at=now()
  where id=v_thread;

  select coach_id into v_coach
  from public.coach_clients
  where client_id=v_user and status='active'
  order by started_at desc nulls last
  limit 1;

  if v_coach is not null then
    v_action:='/inbox?thread='||v_thread::text;
    perform private.enqueue_direct_notification(
      v_user,
      v_coach,
      'Комментарий к тренировке',
      btrim(p_body),
      v_action,
      jsonb_build_object(
        'kind','feedback',
        'thread_id',v_thread,
        'workout_session_id',v_session,
        'workout_exercise_id',p_workout_exercise_id
      )
    );
  end if;

  return v_thread;
end;
$function$;

create or replace function public.reply_to_feedback(p_thread_id uuid, p_body text)
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
        'workout_session_id',v_thread.workout_session_id,
        'workout_exercise_id',v_thread.workout_exercise_id
      )
    );
  end if;

  return v_id;
end;
$function$;
