create unique index if not exists nutrition_plans_one_active_per_client_uq
on public.nutrition_plans(client_id)
where client_id is not null and status='active';

create or replace function public.get_trainer_client_nutrition_plans(p_client_id uuid)
returns table(
  id uuid,
  name text,
  status text,
  version integer,
  daily_kcal_target integer,
  protein_target_g numeric,
  published_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public, pg_temp
as $function$
  select p.id,p.name,p.status,p.version,p.daily_kcal_target,p.protein_target_g,p.published_at,p.updated_at
  from public.nutrition_plans p
  where p.client_id=p_client_id
    and exists(
      select 1 from public.coach_clients cc
      where cc.coach_id=auth.uid()
        and cc.client_id=p_client_id
        and cc.status='active'
    )
  order by (p.status='active') desc,p.updated_at desc;
$function$;

revoke execute on function public.get_trainer_client_nutrition_plans(uuid) from public, anon;
grant execute on function public.get_trainer_client_nutrition_plans(uuid) to authenticated;