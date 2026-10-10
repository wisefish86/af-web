
drop policy if exists profiles_assigned_coach_any_status_read on public.profiles;
create policy profiles_assigned_coach_any_status_read
on public.profiles for select to authenticated
using(
  exists(
    select 1 from public.coach_clients cc
    where cc.client_id=profiles.id and cc.coach_id=(select auth.uid())
  )
);

drop policy if exists measurements_assigned_coach_any_status_read on public.measurements;
create policy measurements_assigned_coach_any_status_read
on public.measurements for select to authenticated
using(exists(select 1 from public.coach_clients cc where cc.client_id=measurements.client_id and cc.coach_id=(select auth.uid())));

drop policy if exists daily_checkins_assigned_coach_any_status_read on public.daily_checkins;
create policy daily_checkins_assigned_coach_any_status_read
on public.daily_checkins for select to authenticated
using(exists(select 1 from public.coach_clients cc where cc.client_id=daily_checkins.client_id and cc.coach_id=(select auth.uid())));

drop policy if exists monthly_checkins_assigned_coach_any_status_read on public.monthly_checkins;
create policy monthly_checkins_assigned_coach_any_status_read
on public.monthly_checkins for select to authenticated
using(exists(select 1 from public.coach_clients cc where cc.client_id=monthly_checkins.client_id and cc.coach_id=(select auth.uid())));

drop policy if exists workout_sessions_assigned_coach_any_status_read on public.workout_sessions;
create policy workout_sessions_assigned_coach_any_status_read
on public.workout_sessions for select to authenticated
using(exists(select 1 from public.coach_clients cc where cc.client_id=workout_sessions.client_id and cc.coach_id=(select auth.uid())));

drop policy if exists client_task_completions_assigned_coach_any_status_read on public.client_task_completions;
create policy client_task_completions_assigned_coach_any_status_read
on public.client_task_completions for select to authenticated
using(exists(select 1 from public.coach_clients cc where cc.client_id=client_task_completions.client_id and cc.coach_id=(select auth.uid())));

drop policy if exists feedback_threads_assigned_coach_any_status_read on public.feedback_threads;
create policy feedback_threads_assigned_coach_any_status_read
on public.feedback_threads for select to authenticated
using(exists(select 1 from public.coach_clients cc where cc.client_id=feedback_threads.client_id and cc.coach_id=(select auth.uid())));

drop policy if exists feedback_messages_assigned_coach_any_status_read on public.feedback_messages;
create policy feedback_messages_assigned_coach_any_status_read
on public.feedback_messages for select to authenticated
using(exists(
  select 1
  from public.feedback_threads ft
  join public.coach_clients cc on cc.client_id=ft.client_id
  where ft.id=feedback_messages.thread_id and cc.coach_id=(select auth.uid())
));

create or replace function public.get_my_trainer_clients_overview()
returns table(
  id uuid,
  display_name text,
  login_alias text,
  nickname text,
  age smallint,
  city text,
  avatar_key text,
  timezone text,
  status text,
  started_at date,
  ended_at date,
  last_activity_at timestamptz,
  last_activity_kind text
)
language sql
stable
security invoker
set search_path to 'public','pg_temp'
as $function$
  select
    p.id,p.display_name,p.login_alias,p.nickname,p.age,p.city,p.avatar_key,p.timezone,
    cc.status,cc.started_at,cc.ended_at,
    activity.at as last_activity_at,
    activity.kind as last_activity_kind
  from public.coach_clients cc
  join public.profiles p on p.id=cc.client_id and p.role='client'
  left join lateral (
    select x.at,x.kind
    from (
      select m.measured_at::timestamp at,'measurement'::text kind from public.measurements m where m.client_id=cc.client_id
      union all select d.checkin_date::timestamp,'daily_checkin' from public.daily_checkins d where d.client_id=cc.client_id
      union all select m.checkin_date::timestamp,'self_assessment' from public.monthly_checkins m where m.client_id=cc.client_id
      union all select coalesce(w.completed_at,w.updated_at,w.started_at),'workout' from public.workout_sessions w where w.client_id=cc.client_id
      union all select c.completed_at,'task' from public.client_task_completions c where c.client_id=cc.client_id
      union all
      select fm.created_at,'message'
      from public.feedback_messages fm
      join public.feedback_threads ft on ft.id=fm.thread_id
      where ft.client_id=cc.client_id and fm.author_id=cc.client_id
    ) x
    where x.at is not null
    order by x.at desc
    limit 1
  ) activity on true
  where cc.coach_id=auth.uid()
    and exists(select 1 from public.profiles me where me.id=auth.uid() and me.role='trainer')
  order by case cc.status when 'active' then 0 when 'paused' then 1 else 2 end,activity.at desc nulls last,p.display_name;
$function$;
