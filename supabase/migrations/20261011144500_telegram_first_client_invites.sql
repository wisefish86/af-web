drop function if exists public.accept_client_telegram_invite_service(text,uuid);

create or replace function public.accept_client_telegram_invite_service(
  p_token_hash text,
  p_client_id uuid,
  p_telegram_id text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $function$
declare
  v_invite public.client_invites%rowtype;
  v_telegram_id text:=nullif(btrim(coalesce(p_telegram_id,'')),'');
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid invite token';
  end if;
  if v_telegram_id is null then raise exception 'Telegram id required'; end if;

  perform pg_advisory_xact_lock(hashtext('telegram-client:'||v_telegram_id));

  if not exists(select 1 from public.profiles p where p.id=p_client_id and p.role='client') then
    raise exception 'Client not found';
  end if;

  if exists(
    select 1
    from public.notification_channels nc
    join public.profiles p on p.id=nc.client_id and p.role='client'
    where nc.channel='telegram'
      and nc.external_id=v_telegram_id
      and nc.enabled=true
      and nc.verified_at is not null
      and nc.client_id<>p_client_id
  ) then
    raise exception 'Telegram is already linked to another client';
  end if;

  select * into v_invite
  from public.client_invites i
  where i.token_hash=p_token_hash
  for update;

  if not found then raise exception 'Invitation not found'; end if;
  if v_invite.revoked_at is not null then raise exception 'Invitation was revoked'; end if;
  if v_invite.accepted_at is not null then
    if v_invite.accepted_by=p_client_id then return v_invite.coach_id; end if;
    raise exception 'Invitation has already been used';
  end if;
  if v_invite.expires_at<=now() then raise exception 'Invitation has expired'; end if;

  insert into public.notification_channels(client_id,channel,external_id,enabled,verified_at,metadata)
  values(p_client_id,'telegram',v_telegram_id,true,now(),coalesce(p_metadata,'{}'::jsonb))
  on conflict(client_id,channel) do update
  set external_id=excluded.external_id,
      enabled=true,
      verified_at=now(),
      metadata=excluded.metadata;

  insert into public.coach_clients(coach_id,client_id,status,started_at)
  values(v_invite.coach_id,p_client_id,'active',current_date)
  on conflict(coach_id,client_id) do update
  set status='active',ended_at=null;

  insert into public.client_modules(client_id,module_code,enabled,assigned_by,settings)
  values
    (p_client_id,'nutrition',true,v_invite.coach_id,'{"tracking_mode":"auto"}'::jsonb),
    (p_client_id,'training',true,v_invite.coach_id,'{}'::jsonb),
    (p_client_id,'progress',true,v_invite.coach_id,'{}'::jsonb),
    (p_client_id,'checkins',true,v_invite.coach_id,'{}'::jsonb),
    (p_client_id,'notifications',true,v_invite.coach_id,'{}'::jsonb)
  on conflict(client_id,module_code) do update
  set enabled=true,ends_at=null,assigned_by=excluded.assigned_by,updated_at=now();

  perform private.apply_default_client_setup(p_client_id,v_invite.coach_id);

  update public.client_invites
  set accepted_at=now(),accepted_by=p_client_id
  where id=v_invite.id;

  return v_invite.coach_id;
end;
$function$;

revoke all on function public.accept_client_telegram_invite_service(text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.accept_client_telegram_invite_service(text,uuid,text,jsonb) to service_role;

create or replace function public.complete_my_access_setup_v2(
  p_display_name text,
  p_nickname text default null,
  p_age integer default null
)
returns text
language plpgsql
security invoker
set search_path to 'public','pg_temp'
as $function$
declare
  v_user uuid:=auth.uid();
  v_name text:=nullif(btrim(p_display_name),'');
  v_nickname text:=nullif(btrim(coalesce(p_nickname,'')),'');
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if v_name is null then raise exception 'Укажи имя.'; end if;
  if length(v_name)>60 then raise exception 'Имя слишком длинное.'; end if;
  if v_nickname is not null and length(v_nickname)>40 then raise exception 'Метка слишком длинная.'; end if;
  if p_age is not null and (p_age<13 or p_age>100) then raise exception 'Возраст должен быть от 13 до 100 лет.'; end if;

  update public.profiles
  set display_name=v_name,
      nickname=v_nickname,
      age=p_age,
      must_set_password=false,
      updated_at=now()
  where id=v_user and role='client';

  if not found then raise exception 'Client profile not found'; end if;
  return v_name;
end;
$function$;

revoke all on function public.complete_my_access_setup_v2(text,text,integer) from public,anon;
grant execute on function public.complete_my_access_setup_v2(text,text,integer) to authenticated;
