
drop policy if exists client_modules_assigned_coach_any_status_read on public.client_modules;
create policy client_modules_assigned_coach_any_status_read
on public.client_modules
for select to authenticated
using(exists(
  select 1 from public.coach_clients cc
  where cc.client_id=client_modules.client_id
    and cc.coach_id=(select auth.uid())
));

drop policy if exists tracking_config_assigned_coach_any_status_read on public.client_tracking_config;
create policy tracking_config_assigned_coach_any_status_read
on public.client_tracking_config
for select to authenticated
using(exists(
  select 1 from public.coach_clients cc
  where cc.client_id=client_tracking_config.client_id
    and cc.coach_id=(select auth.uid())
));

drop policy if exists reminder_rules_assigned_coach_any_status_read on public.reminder_rules;
create policy reminder_rules_assigned_coach_any_status_read
on public.reminder_rules
for select to authenticated
using(exists(
  select 1 from public.coach_clients cc
  where cc.client_id=reminder_rules.client_id
    and cc.coach_id=(select auth.uid())
));

create or replace function public.get_trainer_client_nutrition_plans(p_client_id uuid)
returns table(
  id uuid,name text,status text,version integer,daily_kcal_target integer,
  protein_target_g numeric,published_at timestamptz,updated_at timestamptz
)
language sql
security definer
set search_path to 'public','pg_temp'
as $function$
  select p.id,p.name,p.status,p.version,p.daily_kcal_target,p.protein_target_g,p.published_at,p.updated_at
  from public.nutrition_plans p
  where p.client_id=p_client_id
    and exists(
      select 1 from public.coach_clients cc
      where cc.coach_id=auth.uid()
        and cc.client_id=p_client_id
    )
  order by (p.status='active') desc,p.updated_at desc;
$function$;
