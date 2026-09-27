-- Allow a trainer to read profile rows only for active assigned clients.
create policy profiles_assigned_coach_select
on public.profiles
for select to authenticated
using (
  exists (
    select 1
    from public.coach_clients cc
    where cc.client_id=profiles.id
      and cc.coach_id=(select auth.uid())
      and cc.status='active'
  )
);
