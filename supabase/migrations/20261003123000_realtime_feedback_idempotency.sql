-- Realtime + retry-safe feedback hardening for the first client pilot.
alter table public.feedback_messages
  add column if not exists request_id uuid;

create unique index if not exists feedback_messages_author_request_uq
  on public.feedback_messages(author_id,request_id)
  where request_id is not null;

create unique index if not exists feedback_threads_client_workout_exercise_uq
  on public.feedback_threads(client_id,workout_exercise_id)
  where workout_exercise_id is not null;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='notification_deliveries'
  ) then execute 'alter publication supabase_realtime add table public.notification_deliveries'; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='feedback_threads'
  ) then execute 'alter publication supabase_realtime add table public.feedback_threads'; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='feedback_messages'
  ) then execute 'alter publication supabase_realtime add table public.feedback_messages'; end if;
end $$;

create or replace function public.add_workout_comment_v2(
  p_workout_exercise_id uuid,p_body text,p_request_id uuid
) returns uuid
language plpgsql security definer
set search_path to 'public','private','pg_temp'
as $function$
declare
  v_user uuid:=auth.uid();
  v_session uuid;
  v_thread uuid;
  v_message uuid;
  v_existing_thread uuid;
  v_coach uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_request_id is null then raise exception 'Request id required'; end if;
  if nullif(btrim(p_body),'') is null then raise exception 'Message is empty'; end if;
  if not public.my_client_access_active(v_user) then raise exception 'Client access is not active'; end if;

  select fm.thread_id into v_existing_thread
  from public.feedback_messages fm
  where fm.author_id=v_user and fm.request_id=p_request_id
  limit 1;
  if v_existing_thread is not null then return v_existing_thread; end if;

  select we.workout_session_id into v_session
  from public.workout_exercises we
  join public.workout_sessions ws on ws.id=we.workout_session_id
  where we.id=p_workout_exercise_id and ws.client_id=v_user;
  if not found then raise exception 'Workout exercise not found'; end if;

  insert into public.feedback_threads(
    client_id,workout_session_id,workout_exercise_id,context_type,status,created_by,created_at,updated_at
  ) values(
    v_user,v_session,p_workout_exercise_id,'workout_exercise','new',v_user,now(),now()
  )
  on conflict (client_id,workout_exercise_id) where workout_exercise_id is not null
  do update set workout_session_id=excluded.workout_session_id
  returning id into v_thread;

  insert into public.feedback_messages(thread_id,author_id,body,request_id)
  values(v_thread,v_user,btrim(p_body),p_request_id)
  on conflict (author_id,request_id) where request_id is not null do nothing
  returning id into v_message;

  if v_message is null then
    select fm.thread_id into v_existing_thread
    from public.feedback_messages fm
    where fm.author_id=v_user and fm.request_id=p_request_id
    limit 1;
    return coalesce(v_existing_thread,v_thread);
  end if;

  update public.feedback_threads
  set status='new',resolved_at=null,updated_at=now()
  where id=v_thread;

  select coach_id into v_coach
  from public.coach_clients
  where client_id=v_user and status='active'
  order by started_at desc nulls last
  limit 1;

  if v_coach is not null then
    perform private.enqueue_direct_notification(
      v_user,v_coach,'Комментарий к тренировке',btrim(p_body),
      '/inbox?thread='||v_thread::text,
      jsonb_build_object(
        'kind','feedback','thread_id',v_thread,'workout_session_id',v_session,
        'workout_exercise_id',p_workout_exercise_id
      )
    );
  end if;
  return v_thread;
end;
$function$;

create or replace function public.reply_to_feedback_v2(
  p_thread_id uuid,p_body text,p_request_id uuid
) returns uuid
language plpgsql security definer
set search_path to 'public','private','pg_temp'
as $function$
declare
  v_user uuid:=auth.uid();
  v_thread public.feedback_threads%rowtype;
  v_id uuid;
  v_existing uuid;
  v_recipient uuid;
  v_title text;
  v_action text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_request_id is null then raise exception 'Request id required'; end if;
  if nullif(btrim(p_body),'') is null then raise exception 'Message is empty'; end if;

  select fm.id into v_existing
  from public.feedback_messages fm
  where fm.author_id=v_user and fm.request_id=p_request_id
  limit 1;
  if v_existing is not null then return v_existing; end if;

  select * into v_thread from public.feedback_threads where id=p_thread_id;
  if not found then raise exception 'Thread not found'; end if;

  if v_user=v_thread.client_id then
    if not public.my_client_access_active(v_thread.client_id) then raise exception 'Client access is not active'; end if;
  elsif not exists(
    select 1 from public.coach_clients
    where client_id=v_thread.client_id and coach_id=v_user and status='active'
  ) then raise exception 'Access denied';
  end if;

  insert into public.feedback_messages(thread_id,author_id,body,request_id)
  values(p_thread_id,v_user,btrim(p_body),p_request_id)
  on conflict (author_id,request_id) where request_id is not null do nothing
  returning id into v_id;

  if v_id is null then
    select fm.id into v_existing
    from public.feedback_messages fm
    where fm.author_id=v_user and fm.request_id=p_request_id
    limit 1;
    if v_existing is not null then return v_existing; end if;
    raise exception 'Message retry could not be resolved';
  end if;

  update public.feedback_threads
  set status=case when v_user=v_thread.client_id then 'new' else 'in_progress' end,
      assigned_to=case when v_user=v_thread.client_id then assigned_to else v_user end,
      resolved_at=null,updated_at=now()
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
      v_thread.client_id,v_recipient,v_title,btrim(p_body),v_action,
      jsonb_build_object(
        'kind','feedback','thread_id',p_thread_id,'context_type',v_thread.context_type,
        'context_key',v_thread.context_key,'workout_session_id',v_thread.workout_session_id,
        'workout_exercise_id',v_thread.workout_exercise_id
      )
    );
  end if;
  return v_id;
end;
$function$;

revoke all on function public.add_workout_comment_v2(uuid,text,uuid) from public,anon;
grant execute on function public.add_workout_comment_v2(uuid,text,uuid) to authenticated;
revoke all on function public.reply_to_feedback_v2(uuid,text,uuid) from public,anon;
grant execute on function public.reply_to_feedback_v2(uuid,text,uuid) to authenticated;

create or replace function public.add_workout_comment(p_workout_exercise_id uuid,p_body text)
returns uuid language plpgsql security definer
set search_path to 'public','private','pg_temp'
as $function$
begin
  return public.add_workout_comment_v2(p_workout_exercise_id,p_body,gen_random_uuid());
end;
$function$;

create or replace function public.reply_to_feedback(p_thread_id uuid,p_body text)
returns uuid language plpgsql security definer
set search_path to 'public','private','pg_temp'
as $function$
begin
  return public.reply_to_feedback_v2(p_thread_id,p_body,gen_random_uuid());
end;
$function$;

revoke all on function public.add_workout_comment(uuid,text) from public,anon;
grant execute on function public.add_workout_comment(uuid,text) to authenticated;
revoke all on function public.reply_to_feedback(uuid,text) from public,anon;
grant execute on function public.reply_to_feedback(uuid,text) to authenticated;
