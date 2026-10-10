create table if not exists private.telegram_web_login_sessions(
  token_hash text primary key,
  status text not null default 'pending'
    check(status in ('pending','linked','blocked','unlinked','error')),
  profile_id uuid null references public.profiles(id) on delete cascade,
  telegram_id text null,
  reason text null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '10 minutes'),
  consumed_at timestamptz null
);

create index if not exists telegram_web_login_sessions_expires_idx
  on private.telegram_web_login_sessions(expires_at);

revoke all on table private.telegram_web_login_sessions from public,anon,authenticated;

create or replace function public.create_telegram_web_login_session_service(p_token_hash text)
returns void
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $function$
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid web login token';
  end if;

  delete from private.telegram_web_login_sessions
  where expires_at < now()-interval '1 hour'
     or consumed_at < now()-interval '1 hour';

  insert into private.telegram_web_login_sessions(token_hash,expires_at)
  values(p_token_hash,now()+interval '10 minutes')
  on conflict(token_hash) do nothing;
end;
$function$;

create or replace function public.resolve_telegram_web_login_session_service(
  p_token_hash text,
  p_status text,
  p_profile_id uuid default null,
  p_telegram_id text default null,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $function$
declare
  v_count integer;
begin
  if p_status not in ('linked','blocked','unlinked','error') then
    raise exception 'Invalid web login status';
  end if;

  update private.telegram_web_login_sessions
  set status=p_status,
      profile_id=p_profile_id,
      telegram_id=nullif(btrim(coalesce(p_telegram_id,'')),''),
      reason=nullif(btrim(coalesce(p_reason,'')),'')
  where token_hash=p_token_hash
    and status='pending'
    and consumed_at is null
    and expires_at>now();

  get diagnostics v_count=row_count;
  return v_count=1;
end;
$function$;

create or replace function public.read_telegram_web_login_session_service(p_token_hash text)
returns table(
  status text,
  profile_id uuid,
  reason text,
  expires_at timestamptz,
  consumed_at timestamptz
)
language sql
security definer
set search_path to 'public','private','pg_temp'
as $function$
  select s.status,s.profile_id,s.reason,s.expires_at,s.consumed_at
  from private.telegram_web_login_sessions s
  where s.token_hash=p_token_hash
  limit 1;
$function$;

create or replace function public.consume_telegram_web_login_session_service(p_token_hash text)
returns boolean
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $function$
declare
  v_count integer;
begin
  update private.telegram_web_login_sessions
  set consumed_at=now()
  where token_hash=p_token_hash
    and status='linked'
    and consumed_at is null
    and expires_at>now();

  get diagnostics v_count=row_count;
  return v_count=1;
end;
$function$;

revoke all on function public.create_telegram_web_login_session_service(text) from public,anon,authenticated;
revoke all on function public.resolve_telegram_web_login_session_service(text,text,uuid,text,text) from public,anon,authenticated;
revoke all on function public.read_telegram_web_login_session_service(text) from public,anon,authenticated;
revoke all on function public.consume_telegram_web_login_session_service(text) from public,anon,authenticated;

grant execute on function public.create_telegram_web_login_session_service(text) to service_role;
grant execute on function public.resolve_telegram_web_login_session_service(text,text,uuid,text,text) to service_role;
grant execute on function public.read_telegram_web_login_session_service(text) to service_role;
grant execute on function public.consume_telegram_web_login_session_service(text) to service_role;
