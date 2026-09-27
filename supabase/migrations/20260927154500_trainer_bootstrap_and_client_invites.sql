
-- Bootstrap the first trainer and add scalable trainer->client invitations.

create table if not exists public.client_invites (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete restrict,
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists client_invites_coach_idx
  on public.client_invites(coach_id,created_at desc);
create index if not exists client_invites_open_idx
  on public.client_invites(expires_at)
  where accepted_at is null and revoked_at is null;

alter table public.client_invites enable row level security;
revoke all on public.client_invites from anon;
grant select,update on public.client_invites to authenticated;

drop policy if exists client_invites_coach_select on public.client_invites;
create policy client_invites_coach_select on public.client_invites
for select to authenticated
using (
  coach_id=(select auth.uid())
  and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='trainer')
);

drop policy if exists client_invites_coach_update on public.client_invites;
create policy client_invites_coach_update on public.client_invites
for update to authenticated
using (
  coach_id=(select auth.uid())
  and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='trainer')
)
with check (
  coach_id=(select auth.uid())
  and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='trainer')
);

create or replace function public.trainer_bootstrap_available()
returns boolean
language sql
security definer
stable
set search_path=public,pg_temp
as $$
  select not exists(select 1 from public.profiles where role='trainer');
$$;

revoke all on function public.trainer_bootstrap_available() from public;
grant execute on function public.trainer_bootstrap_available() to anon,authenticated;

create or replace function public.claim_initial_trainer()
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  perform pg_advisory_xact_lock(7349201);

  if exists(select 1 from public.profiles where role='trainer') then
    if exists(select 1 from public.profiles where id=v_user and role='trainer') then
      return;
    end if;
    raise exception 'Initial trainer is already configured';
  end if;

  update public.profiles
  set role='trainer',updated_at=now()
  where id=v_user;

  if not found then raise exception 'Profile not found'; end if;
end;
$$;

revoke all on function public.claim_initial_trainer() from public,anon;
grant execute on function public.claim_initial_trainer() to authenticated;

create or replace function public.create_client_invite(p_hours integer default 168)
returns text
language plpgsql
security definer
set search_path=public,extensions,pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_token text;
  v_hash text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.profiles p where p.id=v_user and p.role='trainer') then
    raise exception 'Trainer role required';
  end if;

  p_hours := greatest(1,least(coalesce(p_hours,168),720));
  v_token := encode(gen_random_bytes(24),'hex');
  v_hash := encode(digest(convert_to(v_token,'UTF8'),'sha256'),'hex');

  insert into public.client_invites(coach_id,token_hash,expires_at)
  values(v_user,v_hash,now()+make_interval(hours=>p_hours));

  return v_token;
end;
$$;

revoke all on function public.create_client_invite(integer) from public,anon;
grant execute on function public.create_client_invite(integer) to authenticated;

create or replace function public.accept_client_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path=public,extensions,pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_hash text;
  v_invite public.client_invites%rowtype;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if nullif(btrim(p_token),'') is null then raise exception 'Invite token is required'; end if;

  if not exists(select 1 from public.profiles p where p.id=v_user and p.role='client') then
    raise exception 'Only client accounts can accept client invitations';
  end if;

  v_hash := encode(digest(convert_to(btrim(p_token),'UTF8'),'sha256'),'hex');

  select * into v_invite
  from public.client_invites i
  where i.token_hash=v_hash
  for update;

  if not found then raise exception 'Invitation not found'; end if;
  if v_invite.revoked_at is not null then raise exception 'Invitation was revoked'; end if;
  if v_invite.accepted_at is not null then
    if v_invite.accepted_by=v_user then return v_invite.coach_id; end if;
    raise exception 'Invitation has already been used';
  end if;
  if v_invite.expires_at<=now() then raise exception 'Invitation has expired'; end if;

  insert into public.coach_clients(coach_id,client_id,status,started_at)
  values(v_invite.coach_id,v_user,'active',current_date)
  on conflict (coach_id,client_id) do update
  set status='active',ended_at=null;

  insert into public.client_modules(client_id,module_code,enabled,assigned_by,settings)
  values
    (v_user,'nutrition',true,v_invite.coach_id,'{"tracking_mode":"auto"}'::jsonb),
    (v_user,'training',true,v_invite.coach_id,'{}'::jsonb),
    (v_user,'progress',true,v_invite.coach_id,'{}'::jsonb),
    (v_user,'checkins',true,v_invite.coach_id,'{}'::jsonb)
  on conflict (client_id,module_code) do update
  set enabled=true,ends_at=null,assigned_by=excluded.assigned_by,updated_at=now();

  update public.client_invites
  set accepted_at=now(),accepted_by=v_user
  where id=v_invite.id;

  return v_invite.coach_id;
end;
$$;

revoke all on function public.accept_client_invite(text) from public,anon;
grant execute on function public.accept_client_invite(text) to authenticated;

create or replace function public.revoke_client_invite(p_invite_id uuid)
returns void
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
begin
  update public.client_invites
  set revoked_at=now()
  where id=p_invite_id
    and coach_id=(select auth.uid())
    and accepted_at is null
    and revoked_at is null;

  if not found then raise exception 'Open invitation not found'; end if;
end;
$$;

revoke all on function public.revoke_client_invite(uuid) from public,anon;
grant execute on function public.revoke_client_invite(uuid) to authenticated;

-- One-time Telegram link tokens. The future bot exchanges a plaintext token for the client id.
create or replace function public.create_my_telegram_link_token()
returns text
language plpgsql
security definer
set search_path=public,private,extensions,pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_token text;
  v_hash text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  v_token := encode(gen_random_bytes(18),'hex');
  v_hash := encode(digest(convert_to(v_token,'UTF8'),'sha256'),'hex');

  update private.telegram_link_tokens
  set used_at=now()
  where client_id=v_user and used_at is null;

  insert into private.telegram_link_tokens(client_id,token_hash,expires_at)
  values(v_user,v_hash,now()+interval '15 minutes');

  return v_token;
end;
$$;

revoke all on function public.create_my_telegram_link_token() from public,anon;
grant execute on function public.create_my_telegram_link_token() to authenticated;
