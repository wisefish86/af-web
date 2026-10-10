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
  v_exact_valid boolean:=false;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{36}$' then
    raise exception 'Invalid Telegram link token';
  end if;
  if p_telegram_id is null or btrim(p_telegram_id)='' then
    raise exception 'Telegram user required';
  end if;

  v_hash:=encode(digest(convert_to(p_token,'UTF8'),'sha256'),'hex');

  select t.client_id,true into v_client_id,v_exact_valid
  from private.telegram_link_tokens t
  where t.token_hash=v_hash
    and t.used_at is null
    and t.expires_at>now()
  for update;

  if v_client_id is null then
    select stale.client_id into v_client_id
    from private.telegram_link_tokens stale
    where stale.token_hash=v_hash
      and stale.created_at>now()-interval '2 hours'
      and exists(
        select 1
        from private.telegram_link_tokens fresh
        where fresh.client_id=stale.client_id
          and fresh.used_at is null
          and fresh.expires_at>now()
          and fresh.created_at>stale.created_at
      )
    order by stale.created_at desc
    limit 1;

    if v_client_id is null then
      raise exception 'Telegram link expired or already used';
    end if;
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

  select nc.external_id into v_existing_external
  from public.notification_channels nc
  where nc.client_id=v_client_id and nc.channel='telegram'
  limit 1;

  if v_existing_external is not null and v_existing_external<>p_telegram_id then
    raise exception 'Client Telegram is already linked to another account';
  end if;

  if exists(
    select 1 from public.notification_channels nc
    where nc.channel='telegram'
      and nc.external_id=p_telegram_id
      and nc.client_id<>v_client_id
  ) then
    raise exception 'Telegram account is already linked to another profile';
  end if;

  update private.telegram_link_tokens
  set used_at=now()
  where client_id=v_client_id and used_at is null;

  insert into public.notification_channels(
    client_id,channel,external_id,enabled,verified_at,metadata
  )
  values(
    v_client_id,'telegram',p_telegram_id,true,now(),
    coalesce(p_metadata,'{}'::jsonb)
      || jsonb_build_object('stale_start_recovered',not v_exact_valid)
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
    set telegram_enabled=true,updated_at=now();

  return v_client_id;
end;
$function$;

revoke all on function public.consume_client_telegram_link_token_service(text,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.consume_client_telegram_link_token_service(text,text,jsonb)
  to service_role;
