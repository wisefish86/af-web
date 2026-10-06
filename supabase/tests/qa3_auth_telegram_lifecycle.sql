-- QA-3 Telegram/auth lifecycle smoke.
-- Uses one existing active trainer/client pair and rolls every change back.

begin;

do $$
declare
  v_coach uuid;
  v_client uuid;
  v_token1 text;
  v_token2 text;
  v_fake_telegram text:='qa3-'||replace(gen_random_uuid()::text,'-','');
  v_consumed uuid;
  v_failed boolean:=false;
  v_web_hash text:=encode(digest(convert_to(gen_random_uuid()::text,'UTF8'),'sha256'),'hex');
  v_rows record;
  v_ok boolean;
begin
  select cc.coach_id,cc.client_id
  into v_coach,v_client
  from public.coach_clients cc
  join public.profiles p on p.id=cc.client_id and p.role='client'
  left join public.notification_channels nc
    on nc.client_id=cc.client_id and nc.channel='telegram'
  where cc.status='active' and nc.external_id is null
  limit 1;

  if v_coach is null or v_client is null then
    raise exception 'Telegram smoke requires an active client without Telegram binding';
  end if;

  v_token1:=public.create_client_telegram_link_token_service(v_coach,v_client);
  if v_token1 is null or length(v_token1)<>36 then
    raise exception 'First Telegram link token has unexpected format';
  end if;

  v_token2:=public.create_client_telegram_link_token_service(v_coach,v_client);
  if v_token2 is null or v_token2=v_token1 then
    raise exception 'Second Telegram link token was not regenerated';
  end if;

  if (
    select count(*)
    from private.telegram_link_tokens
    where client_id=v_client and used_at is null and expires_at>now()
  )<>1 then
    raise exception 'Exactly one live Telegram link token must remain';
  end if;

  v_consumed:=public.consume_client_telegram_link_token_service(
    v_token2,
    v_fake_telegram,
    jsonb_build_object('source','qa3-smoke')
  );
  if v_consumed is distinct from v_client then
    raise exception 'Telegram link token resolved wrong client';
  end if;

  if not exists(
    select 1 from public.notification_channels
    where client_id=v_client and channel='telegram'
      and external_id=v_fake_telegram and enabled=true and verified_at is not null
  ) then
    raise exception 'Telegram binding was not created';
  end if;

  begin
    perform public.consume_client_telegram_link_token_service(
      v_token2,
      v_fake_telegram,
      '{}'::jsonb
    );
  exception when others then
    v_failed:=true;
  end;
  if not v_failed then
    raise exception 'Consumed Telegram link token was accepted twice';
  end if;

  perform public.create_telegram_web_login_session_service(v_web_hash);

  select * into v_rows
  from public.read_telegram_web_login_session_service(v_web_hash)
  limit 1;
  if v_rows.status is distinct from 'pending' then
    raise exception 'Web login session must start pending';
  end if;

  v_ok:=public.resolve_telegram_web_login_session_service(
    v_web_hash,'linked',v_client,v_fake_telegram,null
  );
  if v_ok is distinct from true then
    raise exception 'Web login session was not resolved';
  end if;

  select * into v_rows
  from public.read_telegram_web_login_session_service(v_web_hash)
  limit 1;
  if v_rows.status is distinct from 'linked' or v_rows.profile_id is distinct from v_client then
    raise exception 'Resolved web login session has wrong state';
  end if;

  v_ok:=public.consume_telegram_web_login_session_service(v_web_hash);
  if v_ok is distinct from true then
    raise exception 'Linked web login session was not consumed';
  end if;

  v_ok:=public.consume_telegram_web_login_session_service(v_web_hash);
  if v_ok is distinct from false then
    raise exception 'Consumed web login session was accepted twice';
  end if;
end $$;

rollback;
