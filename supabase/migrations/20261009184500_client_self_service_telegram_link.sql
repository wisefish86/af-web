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
  v_actor_role text;
begin
  if p_trainer_id is null or p_client_id is null then
    raise exception 'Actor and client are required';
  end if;

  select p.role into v_actor_role
  from public.profiles p
  where p.id=p_trainer_id;

  if v_actor_role='client' then
    if p_trainer_id<>p_client_id then
      raise exception 'Client can link only own Telegram';
    end if;
    if not exists(
      select 1
      from public.coach_clients cc
      where cc.client_id=p_client_id
        and cc.status='active'
    ) then
      raise exception 'Active client relationship required';
    end if;
  elsif v_actor_role='trainer' then
    if not exists(
      select 1
      from public.coach_clients cc
      where cc.coach_id=p_trainer_id
        and cc.client_id=p_client_id
        and cc.status='active'
    ) then
      raise exception 'Active client relationship required';
    end if;
  else
    raise exception 'Client or trainer access required';
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
