-- QA-3 auth/profile/lifecycle consistency smoke.
-- Read-only: fails if Auth, profiles and client lifecycle drift apart.

do $$
declare
  v_count bigint;
begin
  select count(*) into v_count
  from public.profiles p
  left join auth.users u on u.id=p.id
  where u.id is null;
  if v_count<>0 then raise exception 'Profiles without auth users: %',v_count; end if;

  select count(*) into v_count
  from auth.users u
  left join public.profiles p on p.id=u.id
  where p.id is null;
  if v_count<>0 then raise exception 'Auth users without profiles: %',v_count; end if;

  select count(*) into v_count
  from public.coach_clients cc
  join auth.users u on u.id=cc.client_id
  where cc.status='active'
    and u.banned_until is not null
    and u.banned_until>now();
  if v_count<>0 then raise exception 'Active clients still banned: %',v_count; end if;

  select count(*) into v_count
  from public.coach_clients cc
  join auth.users u on u.id=cc.client_id
  where cc.status in ('paused','finished')
    and (u.banned_until is null or u.banned_until<=now());
  if v_count<>0 then raise exception 'Inactive clients not banned: %',v_count; end if;

  select count(*) into v_count
  from public.coach_clients cc
  join public.profiles p on p.id=cc.client_id
  where cc.status='active' and p.role<>'client';
  if v_count<>0 then raise exception 'Active client relationships with wrong role: %',v_count; end if;
end $$;
