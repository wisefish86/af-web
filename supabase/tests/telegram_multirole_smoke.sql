-- Multi-role Telegram + exercise-library smoke. Rolls back all writes.
begin;

do $$
declare
  v_coach uuid;
  v_client uuid;
  v_fake text:='qa-multirole-'||replace(gen_random_uuid()::text,'-','');
  v_hash text:=encode(digest(convert_to(gen_random_uuid()::text,'UTF8'),'sha256'),'hex');
  v_row record;
begin
  select cc.coach_id,cc.client_id into v_coach,v_client
  from public.coach_clients cc
  join public.profiles coach on coach.id=cc.coach_id and coach.role='trainer'
  join public.profiles client on client.id=cc.client_id and client.role='client'
  where cc.status='active'
  limit 1;

  if v_coach is null or v_client is null then raise exception 'Active coach/client pair required'; end if;

  insert into public.notification_channels(client_id,channel,external_id,enabled,verified_at,metadata)
  values
    (v_coach,'telegram',v_fake,true,now(),'{"qa":"trainer"}'::jsonb),
    (v_client,'telegram',v_fake,true,now(),'{"qa":"client"}'::jsonb)
  on conflict(client_id,channel) do update
    set external_id=excluded.external_id,enabled=true,verified_at=excluded.verified_at,metadata=excluded.metadata;

  if (select count(*) from public.notification_channels where channel='telegram' and external_id=v_fake)<>2 then
    raise exception 'Same Telegram id must coexist across trainer/client profiles';
  end if;

  perform public.create_telegram_web_login_session_service(v_hash,'trainer');
  select * into v_row from public.read_telegram_web_login_session_service(v_hash) limit 1;
  if v_row.requested_role is distinct from 'trainer' then raise exception 'Requested Telegram login role was not persisted'; end if;

  if not exists(
    select 1 from public.exercises e
    join public.exercise_muscle_groups emg on emg.exercise_id=e.id
    where e.code='TRICEPS_OVERHEAD_STRAIGHT_BAR_EXT'
      and e.is_active=true
      and emg.muscle_group_code='triceps'
      and emg.role='primary'
  ) then
    raise exception 'Overhead straight-bar triceps exercise missing';
  end if;
end $$;

rollback;
