-- Daily wellbeing check-in retry/idempotency smoke.
-- Repeating the same save must not duplicate the daily row, feedback message,
-- or trainer notification. All mutations roll back.

begin;

do $$
declare
  v_client uuid;
  v_coach uuid;
  v_date date:=current_date;
  v_comment text:='QA wellbeing '||gen_random_uuid()::text;
  v_count integer;
begin
  select cc.client_id,cc.coach_id
  into v_client,v_coach
  from public.coach_clients cc
  join public.profiles c on c.id=cc.client_id and c.role='client'
  join public.profiles t on t.id=cc.coach_id and t.role='trainer'
  where cc.status='active'
  order by cc.started_at
  limit 1;

  if v_client is null or v_coach is null then
    raise exception 'QA wellbeing smoke requires one active trainer/client pair';
  end if;

  insert into public.notification_preferences(user_id,in_app_enabled,telegram_enabled)
  values(v_coach,true,false)
  on conflict(user_id) do update
  set in_app_enabled=true,telegram_enabled=false,updated_at=now();

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',v_client,'role','authenticated')::text,
    true
  );
  set local role authenticated;

  perform public.save_my_wellbeing_checkin(v_date,2::smallint,4::smallint,2::smallint,4::smallint,4::smallint,v_comment);
  perform public.save_my_wellbeing_checkin(v_date,2::smallint,4::smallint,2::smallint,4::smallint,4::smallint,v_comment);

  select count(*) into v_count
  from public.daily_checkins
  where client_id=v_client and checkin_date=v_date;
  if v_count<>1 then
    raise exception 'Repeated wellbeing save produced % daily rows instead of 1',v_count;
  end if;

  select count(*) into v_count
  from public.feedback_messages m
  join public.feedback_threads t on t.id=m.thread_id
  where t.client_id=v_client
    and t.context_type='daily_checkin'
    and t.context_key=v_date::text
    and m.author_id=v_client
    and m.body=v_comment;
  if v_count<>1 then
    raise exception 'Repeated wellbeing save produced % feedback messages instead of 1',v_count;
  end if;

  select count(*) into v_count
  from public.notification_deliveries
  where recipient_id=v_coach
    and channel='in_app'
    and body=v_comment;
  if v_count<>1 then
    raise exception 'Repeated wellbeing save produced % trainer notifications instead of 1',v_count;
  end if;

  reset role;
end $$;

rollback;
