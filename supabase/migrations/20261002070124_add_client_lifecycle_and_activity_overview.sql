
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
security definer
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
      select m.measured_at::timestamp at,'measurement'::text kind
      from public.measurements m
      where m.client_id=cc.client_id
      union all
      select d.checkin_date::timestamp,'daily_checkin'
      from public.daily_checkins d
      where d.client_id=cc.client_id
      union all
      select m.checkin_date::timestamp,'self_assessment'
      from public.monthly_checkins m
      where m.client_id=cc.client_id
      union all
      select coalesce(w.completed_at,w.updated_at,w.started_at),'workout'
      from public.workout_sessions w
      where w.client_id=cc.client_id
      union all
      select c.completed_at,'task'
      from public.client_task_completions c
      where c.client_id=cc.client_id
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
    and exists(
      select 1 from public.profiles me
      where me.id=auth.uid() and me.role='trainer'
    )
  order by
    case cc.status when 'active' then 0 when 'paused' then 1 else 2 end,
    activity.at desc nulls last,
    p.display_name;
$function$;

revoke all on function public.get_my_trainer_clients_overview() from public,anon;
grant execute on function public.get_my_trainer_clients_overview() to authenticated;

create or replace function public.purge_client_profile_data(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $function$
begin
  if auth.role()<>'service_role' then
    raise exception 'Service role required';
  end if;

  delete from public.notification_deliveries where client_id=p_client_id or recipient_id=p_client_id;
  delete from public.notification_preferences where user_id=p_client_id;
  delete from public.notification_channels where client_id=p_client_id;
  delete from public.reminder_rules where client_id=p_client_id or created_by=p_client_id;

  delete from public.feedback_threads where client_id=p_client_id;
  delete from public.workout_sessions where client_id=p_client_id;
  delete from public.training_programs where client_id=p_client_id or created_by=p_client_id;

  delete from public.daily_checkins where client_id=p_client_id;
  delete from public.measurements where client_id=p_client_id;
  delete from public.monthly_checkins where client_id=p_client_id;
  delete from public.client_task_completions where client_id=p_client_id;

  delete from public.client_nutrition_assignments where client_id=p_client_id or assigned_by=p_client_id;
  delete from public.nutrition_plans where client_id=p_client_id or created_by=p_client_id;
  delete from public.nutrition_plan_templates where created_by=p_client_id;
  delete from public.saved_meals where created_by=p_client_id;
  delete from public.meal_templates where client_id=p_client_id;
  delete from public.client_foods where client_id=p_client_id;
  delete from public.client_food_preferences where client_id=p_client_id;
  delete from public.client_food_group_preferences where client_id=p_client_id;
  delete from public.client_nutrition_setup where client_id=p_client_id;

  delete from public.client_material_checklist_state where client_id=p_client_id;
  delete from public.client_modules where client_id=p_client_id;
  update public.client_modules set assigned_by=null where assigned_by=p_client_id;
  delete from public.client_targets where client_id=p_client_id;
  update public.client_targets set created_by=null where created_by=p_client_id;
  delete from public.client_tracking_config where client_id=p_client_id;
  update public.client_tracking_config set configured_by=null where configured_by=p_client_id;
  delete from public.client_tracking_preferences where client_id=p_client_id;

  update public.exercise_media set created_by=null where created_by=p_client_id;
  update public.exercise_substitution_groups set created_by=null where created_by=p_client_id;
  update public.exercise_tags set created_by=null where created_by=p_client_id;
  update public.exercises set created_by=null where created_by=p_client_id;
  update public.foods set created_by=null where created_by=p_client_id;

  delete from private.telegram_link_tokens where client_id=p_client_id;
  delete from public.coach_clients where client_id=p_client_id;
end;
$function$;

revoke all on function public.purge_client_profile_data(uuid) from public,anon,authenticated;
grant execute on function public.purge_client_profile_data(uuid) to service_role;
