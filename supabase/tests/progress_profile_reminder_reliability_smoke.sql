-- Progress completion/reminder/body-profile reliability smoke.
-- All mutations are rolled back.

begin;

do $$
declare
  v_client uuid;
  v_timezone text;
  v_period text;
  v_height_one numeric:=181.5;
  v_height_two numeric:=182.5;
  v_wrist numeric:=18.5;
  v_count integer;
begin
  select p.id,coalesce(nullif(p.timezone,''),'Europe/Moscow')
  into v_client,v_timezone
  from public.profiles p
  join public.coach_clients cc on cc.client_id=p.id and cc.status='active'
  join public.client_nutrition_setup ns on ns.client_id=p.id
  where p.role='client'
  order by p.created_at
  limit 1;

  if v_client is null then
    raise exception 'QA progress smoke requires an active client with nutrition setup';
  end if;

  v_period:=to_char((now() at time zone v_timezone)::date,'YYYY-MM');

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',v_client,'role','authenticated')::text,
    true
  );
  set local role authenticated;

  -- Progress photo completion is retry-safe for the same local month.
  perform public.mark_my_task_complete('progress_photo');
  perform public.mark_my_task_complete('progress_photo');

  select count(*) into v_count
  from public.client_task_completions
  where client_id=v_client
    and task_type='progress_photo'
    and period_key=v_period;

  if v_count<>1 then
    raise exception 'Repeated progress photo completion produced % rows instead of 1',v_count;
  end if;

  -- The same monthly check-in reminder can be written repeatedly without duplicates.
  insert into public.reminder_rules(
    client_id,module_code,reminder_type,channel,local_time,weekdays,timezone,
    enabled,settings,created_by,name,channels,recipient_mode,skip_if_completed,
    title_template,body_template,action_path,last_processed_local_date,updated_at
  ) values (
    v_client,'progress','monthly_checkin','in_app','20:30:00',
    array[1,2,3,4,5,6,7],v_timezone,true,
    jsonb_build_object('period','rolling','cadence_days',30,'next_due_date',(current_date+30)::text),
    v_client,'Контрольная самооценка',array['in_app','telegram'],'client',true,
    'Пора повторить самооценку',
    'Прошло около 30 дней с прошлой контрольной точки.',
    '/progress',null,now()
  )
  on conflict(client_id,reminder_type) do update
  set settings=excluded.settings,updated_at=now();

  insert into public.reminder_rules(
    client_id,module_code,reminder_type,channel,local_time,weekdays,timezone,
    enabled,settings,created_by,name,channels,recipient_mode,skip_if_completed,
    title_template,body_template,action_path,last_processed_local_date,updated_at
  ) values (
    v_client,'progress','monthly_checkin','in_app','20:30:00',
    array[1,2,3,4,5,6,7],v_timezone,true,
    jsonb_build_object('period','rolling','cadence_days',30,'next_due_date',(current_date+31)::text),
    v_client,'Контрольная самооценка',array['in_app','telegram'],'client',true,
    'Пора повторить самооценку',
    'Прошло около 30 дней с прошлой контрольной точки.',
    '/progress',null,now()
  )
  on conflict(client_id,reminder_type) do update
  set settings=excluded.settings,updated_at=now();

  select count(*) into v_count
  from public.reminder_rules
  where client_id=v_client and reminder_type='monthly_checkin';

  if v_count<>1 then
    raise exception 'Repeated monthly reminder upsert produced % rows instead of 1',v_count;
  end if;

  -- Saving body profile must update the nutrition setup height in the same transaction.
  perform public.save_my_body_profile(v_height_one,v_wrist,null);

  if not exists(
    select 1
    from public.profiles p
    join public.client_nutrition_setup ns on ns.client_id=p.id
    where p.id=v_client
      and p.height_cm=v_height_one
      and p.wrist_cm=v_wrist
      and ns.height_cm=v_height_one
  ) then
    raise exception 'Body-profile save did not synchronize profile and nutrition height';
  end if;

  reset role;

  -- Reverse direction: nutrition height trigger must synchronize the profile.
  update public.client_nutrition_setup
  set height_cm=v_height_two,updated_at=now()
  where client_id=v_client;

  if not exists(
    select 1
    from public.profiles p
    join public.client_nutrition_setup ns on ns.client_id=p.id
    where p.id=v_client
      and p.height_cm=v_height_two
      and ns.height_cm=v_height_two
  ) then
    raise exception 'Nutrition height did not synchronize back to profile';
  end if;
end $$;

rollback;
