-- Backfill the owner's existing Telegram client binding to the trainer profile.
-- This keeps one Telegram chat while notifications/login remain profile-role specific.
do $$
declare
  v_trainer uuid;
  v_client uuid;
  v_external text;
  v_metadata jsonb;
  v_timezone text;
begin
  select max(value) filter(where key='telegram_owner_trainer_id')::uuid,
         max(value) filter(where key='telegram_owner_test_client_id')::uuid
    into v_trainer,v_client
  from public.app_settings
  where key in ('telegram_owner_trainer_id','telegram_owner_test_client_id');

  if v_trainer is null or v_client is null then return; end if;

  select nc.external_id,nc.metadata
    into v_external,v_metadata
  from public.notification_channels nc
  where nc.client_id=v_client
    and nc.channel='telegram'
    and nc.enabled=true
    and nc.verified_at is not null
    and nullif(nc.external_id,'') is not null
  limit 1;

  if v_external is null then return; end if;

  insert into public.notification_channels(client_id,channel,external_id,enabled,verified_at,metadata)
  values(
    v_trainer,'telegram',v_external,true,now(),
    coalesce(v_metadata,'{}'::jsonb)||jsonb_build_object('owner',true,'purpose','trainer_notifications','source','owner_multirole_backfill')
  )
  on conflict(client_id,channel) do update
    set external_id=excluded.external_id,
        enabled=true,
        verified_at=excluded.verified_at,
        metadata=excluded.metadata;

  select coalesce(p.timezone,'Europe/Moscow') into v_timezone
  from public.profiles p where p.id=v_trainer;

  insert into public.notification_preferences(user_id,telegram_enabled,timezone)
  values(v_trainer,true,coalesce(v_timezone,'Europe/Moscow'))
  on conflict(user_id) do update
    set telegram_enabled=true,
        updated_at=now();
end $$;
