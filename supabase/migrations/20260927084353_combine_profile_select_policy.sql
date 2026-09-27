-- Combine self and assigned-client profile reads into one RLS policy.

drop policy if exists profiles_self_select on public.profiles;
drop policy if exists profiles_assigned_coach_select on public.profiles;

create policy profiles_self_or_assigned_coach_select
on public.profiles
for select to authenticated
using (
  (select auth.uid()) = id
  or exists (
    select 1
    from public.coach_clients cc
    where cc.client_id=profiles.id
      and cc.coach_id=(select auth.uid())
      and cc.status='active'
  )
);
