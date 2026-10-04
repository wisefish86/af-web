drop function if exists public.create_client_telegram_link_token(uuid);

create unique index if not exists notification_channels_channel_external_uq
  on public.notification_channels(channel,external_id)
  where external_id is not null and btrim(external_id)<>'';

create or replace function public.create_client_telegram_link_token_service(
  p_trainer_id uuid,
  p_client_id uuid
)
returns text
language plpgsql
security definer
set search_path to 'public','private','extensions','pg_temp'
as $function$
declare
  v_token text;
  v_hash text;
begin
  if p_trainer_id is null or p_client_id is null then
    raise exception 'Trainer and client are required';
  end if;

  if not exists(
    select 1
    from public.profiles p
    where p.id=p_trainer_id and p.role='trainer'
  ) then
    raise exception 'Trainer access required';
  end if;

  if not exists(
    select 1
    from public.coach_clients cc
    where cc.coach_id=p_trainer_id
      and cc.client_id=p_client_id
      and cc.status='active'
  ) then
    raise exception 'Active client relationship required';
  end if;

  v_token:=encode(gen_random_bytes(18),'hex');
  v_hash:=encode(digest(convert_to(v_token,'UTF8'),'sha256'),'hex');

  update private.telegram_link_tokens
  set used_at=now()
  where client_id=p_client_id and used_at is null;

  insert into private.telegram_link_tokens(client_id,token_hash,expires_at)
  values(p_client_id,v_hash,now()+interval '15 minutes');

  return v_token;
end;
$function$;

revoke all on function public.create_client_telegram_link_token_service(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.create_client_telegram_link_token_service(uuid,uuid)
  to service_role;

create or replace function public.consume_client_telegram_link_token_service(
  p_token text,
  p_telegram_id text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'public','private','extensions','pg_temp'
as $function$
declare
  v_hash text;
  v_client_id uuid;
  v_existing_external text;
  v_timezone text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{36}$' then
    raise exception 'Invalid Telegram link token';
  end if;
  if p_telegram_id is null or btrim(p_telegram_id)='' then
    raise exception 'Telegram user required';
  end if;

  v_hash:=encode(digest(convert_to(p_token,'UTF8'),'sha256'),'hex');

  select t.client_id
    into v_client_id
  from private.telegram_link_tokens t
  where t.token_hash=v_hash
    and t.used_at is null
    and t.expires_at>now()
  for update;

  if v_client_id is null then
    raise exception 'Telegram link expired or already used';
  end if;

  if not exists(
    select 1 from public.profiles p
    where p.id=v_client_id and p.role='client'
  ) then
    raise exception 'Client profile required';
  end if;

  if not exists(
    select 1 from public.coach_clients cc
    where cc.client_id=v_client_id and cc.status='active'
  ) then
    raise exception 'Client is not active';
  end if;

  select nc.external_id
    into v_existing_external
  from public.notification_channels nc
  where nc.client_id=v_client_id and nc.channel='telegram'
  limit 1;

  if v_existing_external is not null and v_existing_external<>p_telegram_id then
    raise exception 'Client Telegram is already linked to another account';
  end if;

  if exists(
    select 1
    from public.notification_channels nc
    where nc.channel='telegram'
      and nc.external_id=p_telegram_id
      and nc.client_id<>v_client_id
  ) then
    raise exception 'Telegram account is already linked to another profile';
  end if;

  update private.telegram_link_tokens
  set used_at=now()
  where token_hash=v_hash;

  insert into public.notification_channels(
    client_id,channel,external_id,enabled,verified_at,metadata
  )
  values(
    v_client_id,'telegram',p_telegram_id,true,now(),coalesce(p_metadata,'{}'::jsonb)
  )
  on conflict(client_id,channel) do update
    set external_id=excluded.external_id,
        enabled=true,
        verified_at=excluded.verified_at,
        metadata=excluded.metadata;

  select coalesce(p.timezone,'Europe/Moscow')
    into v_timezone
  from public.profiles p
  where p.id=v_client_id;

  insert into public.notification_preferences(user_id,telegram_enabled,timezone)
  values(v_client_id,true,coalesce(v_timezone,'Europe/Moscow'))
  on conflict(user_id) do update
    set telegram_enabled=true,
        updated_at=now();

  return v_client_id;
end;
$function$;

revoke all on function public.consume_client_telegram_link_token_service(text,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.consume_client_telegram_link_token_service(text,text,jsonb)
  to service_role;
