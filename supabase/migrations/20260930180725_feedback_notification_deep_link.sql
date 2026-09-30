create or replace function public.reply_to_feedback(p_thread_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_user uuid:=auth.uid();
  v_thread feedback_threads%rowtype;
  v_id uuid;
  v_recipient uuid;
  v_title text;
  v_action text;
begin
  if nullif(btrim(p_body),'') is null then raise exception 'Message is empty'; end if;

  select * into v_thread from feedback_threads where id=p_thread_id;
  if not found then raise exception 'Thread not found'; end if;

  if v_user<>v_thread.client_id and not exists(
    select 1 from coach_clients
    where client_id=v_thread.client_id and coach_id=v_user and status='active'
  ) then raise exception 'Access denied'; end if;

  insert into feedback_messages(thread_id,author_id,body)
  values(p_thread_id,v_user,btrim(p_body))
  returning id into v_id;

  update feedback_threads
  set status=case when v_user=v_thread.client_id then 'new' else 'in_progress' end,
      assigned_to=case when v_user=v_thread.client_id then assigned_to else v_user end,
      resolved_at=null,
      updated_at=now()
  where id=p_thread_id;

  if v_user=v_thread.client_id then
    select coach_id into v_recipient
    from coach_clients
    where client_id=v_thread.client_id and status='active'
    order by started_at desc nulls last
    limit 1;
    v_title:='Новое сообщение клиента';
    v_action:='/inbox';
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
    insert into notification_deliveries(
      client_id,recipient_id,channel,scheduled_for,sent_at,status,title,body,action_path,payload,delivered_at
    )
    values(
      v_thread.client_id,v_recipient,'in_app',now(),now(),'sent',v_title,left(btrim(p_body),240),v_action,
      jsonb_build_object(
        'kind','feedback',
        'thread_id',p_thread_id,
        'workout_session_id',v_thread.workout_session_id,
        'workout_exercise_id',v_thread.workout_exercise_id
      ),
      now()
    );
  end if;

  return v_id;
end
$function$;

revoke execute on function public.reply_to_feedback(uuid,text) from public,anon;
grant execute on function public.reply_to_feedback(uuid,text) to authenticated;
