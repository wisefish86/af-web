create or replace function public.add_workout_comment(p_workout_exercise_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_user uuid:=auth.uid(); v_session uuid; v_thread uuid; v_coach uuid;
begin
 if nullif(btrim(p_body),'') is null then raise exception 'Message is empty'; end if;
 select we.workout_session_id into v_session
 from workout_exercises we join workout_sessions ws on ws.id=we.workout_session_id
 where we.id=p_workout_exercise_id and ws.client_id=v_user;
 if not found then raise exception 'Workout exercise not found'; end if;

 select id into v_thread
 from feedback_threads
 where client_id=v_user and workout_exercise_id=p_workout_exercise_id and status<>'resolved'
 order by created_at desc limit 1;

 if v_thread is null then
  insert into feedback_threads(client_id,workout_session_id,workout_exercise_id,context_type,status,created_by,created_at,updated_at)
  values(v_user,v_session,p_workout_exercise_id,'workout_exercise','new',v_user,now(),now())
  returning id into v_thread;
 end if;

 insert into feedback_messages(thread_id,author_id,body) values(v_thread,v_user,btrim(p_body));
 update feedback_threads set status='new',resolved_at=null,updated_at=now() where id=v_thread;

 select coach_id into v_coach
 from coach_clients
 where client_id=v_user and status='active'
 order by started_at desc nulls last limit 1;

 if v_coach is not null then
  insert into notification_deliveries(client_id,recipient_id,channel,scheduled_for,sent_at,status,title,body,action_path,payload,delivered_at)
  values(v_user,v_coach,'in_app',now(),now(),'sent','Комментарий к тренировке',left(btrim(p_body),240),'/inbox',
         jsonb_build_object('kind','feedback','thread_id',v_thread,'workout_exercise_id',p_workout_exercise_id),now());
 end if;
 return v_thread;
end
$function$;

create or replace function public.reply_to_feedback(p_thread_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_user uuid:=auth.uid(); v_thread feedback_threads%rowtype; v_id uuid; v_recipient uuid; v_title text; v_action text;
begin
 if nullif(btrim(p_body),'') is null then raise exception 'Message is empty'; end if;
 select * into v_thread from feedback_threads where id=p_thread_id;
 if not found then raise exception 'Thread not found'; end if;
 if v_user<>v_thread.client_id and not exists(
   select 1 from coach_clients where client_id=v_thread.client_id and coach_id=v_user and status='active'
 ) then raise exception 'Access denied'; end if;

 insert into feedback_messages(thread_id,author_id,body) values(p_thread_id,v_user,btrim(p_body)) returning id into v_id;
 update feedback_threads
 set status=case when v_user=v_thread.client_id then 'new' else 'in_progress' end,
     assigned_to=case when v_user=v_thread.client_id then assigned_to else v_user end,
     resolved_at=null,updated_at=now()
 where id=p_thread_id;

 if v_user=v_thread.client_id then
   select coach_id into v_recipient from coach_clients
   where client_id=v_thread.client_id and status='active'
   order by started_at desc nulls last limit 1;
   v_title:='Новое сообщение клиента'; v_action:='/inbox';
 else
   v_recipient:=v_thread.client_id; v_title:='Ответ тренера'; v_action:='/notifications';
 end if;

 if v_recipient is not null then
  insert into notification_deliveries(client_id,recipient_id,channel,scheduled_for,sent_at,status,title,body,action_path,payload,delivered_at)
  values(v_thread.client_id,v_recipient,'in_app',now(),now(),'sent',v_title,left(btrim(p_body),240),v_action,
         jsonb_build_object('kind','feedback','thread_id',p_thread_id),now());
 end if;
 return v_id;
end
$function$;
