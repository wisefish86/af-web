-- Feedback/notification reliability smoke.
-- Verifies request-id idempotency, exactly-once in-app notification enqueue,
-- and notification ownership. Every change rolls back.

begin;

do $$
declare
  v_trainer uuid;
  v_client uuid;
  v_workout_exercise uuid;
  v_thread uuid;
  v_client_request uuid:=gen_random_uuid();
  v_trainer_request uuid:=gen_random_uuid();
  v_client_body text:='QA feedback client '||gen_random_uuid()::text;
  v_trainer_body text:='QA feedback trainer '||gen_random_uuid()::text;
  v_owner_body text:='QA notification owner '||gen_random_uuid()::text;
  v_notification uuid;
  v_count integer;
begin
  select cc.coach_id,cc.client_id,we.id
  into v_trainer,v_client,v_workout_exercise
  from public.coach_clients cc
  join public.workout_sessions ws on ws.client_id=cc.client_id
  join public.workout_exercises we on we.workout_session_id=ws.id
  where cc.status='active'
  order by ws.started_at desc,we.sort_order
  limit 1;

  if v_trainer is null or v_client is null or v_workout_exercise is null then
    raise exception 'QA feedback smoke requires one active trainer/client pair with a workout exercise';
  end if;

  insert into public.notification_preferences(user_id,in_app_enabled,telegram_enabled)
  values(v_trainer,true,false)
  on conflict(user_id) do update
  set in_app_enabled=true,telegram_enabled=false,updated_at=now();

  insert into public.notification_preferences(user_id,in_app_enabled,telegram_enabled)
  values(v_client,true,false)
  on conflict(user_id) do update
  set in_app_enabled=true,telegram_enabled=false,updated_at=now();

  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_client,'role','authenticated')::text,true);

  select public.add_workout_comment_v2(v_workout_exercise,v_client_body,v_client_request) into v_thread;
  perform public.add_workout_comment_v2(v_workout_exercise,v_client_body,v_client_request);

  select count(*) into v_count
  from public.feedback_messages
  where author_id=v_client and request_id=v_client_request;
  if v_count<>1 then
    raise exception 'Client feedback request created % messages instead of 1',v_count;
  end if;

  select count(*) into v_count
  from public.notification_deliveries
  where recipient_id=v_trainer
    and channel='in_app'
    and body=v_client_body
    and payload->>'thread_id'=v_thread::text;
  if v_count<>1 then
    raise exception 'Client feedback request created % trainer notifications instead of 1',v_count;
  end if;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_trainer,'role','authenticated')::text,true);

  perform public.reply_to_feedback_v2(v_thread,v_trainer_body,v_trainer_request);
  perform public.reply_to_feedback_v2(v_thread,v_trainer_body,v_trainer_request);

  select count(*) into v_count
  from public.feedback_messages
  where author_id=v_trainer and request_id=v_trainer_request;
  if v_count<>1 then
    raise exception 'Trainer feedback request created % messages instead of 1',v_count;
  end if;

  select count(*) into v_count
  from public.notification_deliveries
  where recipient_id=v_client
    and channel='in_app'
    and body=v_trainer_body
    and payload->>'thread_id'=v_thread::text;
  if v_count<>1 then
    raise exception 'Trainer feedback request created % client notifications instead of 1',v_count;
  end if;

  perform private.enqueue_direct_notification(
    v_client,v_client,'QA ownership',v_owner_body,'/notifications',
    jsonb_build_object('kind','general')
  );

  select id into v_notification
  from public.notification_deliveries
  where recipient_id=v_client and channel='in_app' and body=v_owner_body
  order by created_at desc
  limit 1;

  if v_notification is null then raise exception 'QA ownership notification was not created'; end if;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_trainer,'role','authenticated')::text,true);

  begin
    perform public.mark_notification_read(v_notification);
    raise exception 'EXPECTED_FOREIGN_READ_REJECTION_MISSING';
  exception when others then
    if sqlerrm='EXPECTED_FOREIGN_READ_REJECTION_MISSING' then raise; end if;
    if position('Notification not found' in sqlerrm)=0 then raise; end if;
  end;

  begin
    perform public.dismiss_notification(v_notification);
    raise exception 'EXPECTED_FOREIGN_DISMISS_REJECTION_MISSING';
  exception when others then
    if sqlerrm='EXPECTED_FOREIGN_DISMISS_REJECTION_MISSING' then raise; end if;
    if position('Notification not found' in sqlerrm)=0 then raise; end if;
  end;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_client,'role','authenticated')::text,true);
  perform public.mark_notification_read(v_notification);
  perform public.dismiss_notification(v_notification);

  if not exists(
    select 1 from public.notification_deliveries
    where id=v_notification and recipient_id=v_client
      and read_at is not null and dismissed_at is not null
  ) then
    raise exception 'Owner read/dismiss state was not persisted';
  end if;
end $$;

rollback;
