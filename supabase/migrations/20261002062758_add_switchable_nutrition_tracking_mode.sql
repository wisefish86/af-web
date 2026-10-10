
alter table public.client_nutrition_setup
  add column if not exists tracking_mode text not null default 'meal_plan',
  add column if not exists tracking_mode_changed_at timestamptz not null default now(),
  add column if not exists tracking_mode_changed_by uuid references public.profiles(id) on delete set null;

alter table public.client_nutrition_setup
  drop constraint if exists client_nutrition_setup_tracking_mode_check;

alter table public.client_nutrition_setup
  add constraint client_nutrition_setup_tracking_mode_check
  check(tracking_mode in ('meal_plan','calorie_tracking'));

update public.client_nutrition_setup s
set tracking_mode='calorie_tracking'
where not exists(
  select 1
  from public.nutrition_plans p
  where p.client_id=s.client_id and p.status='active'
);

drop policy if exists "client reads own nutrition setup" on public.client_nutrition_setup;
create policy "client or assigned coach reads nutrition setup"
on public.client_nutrition_setup
for select to authenticated
using(
  client_id=(select auth.uid())
  or exists(
    select 1
    from public.coach_clients cc
    where cc.client_id=client_nutrition_setup.client_id
      and cc.coach_id=(select auth.uid())
      and cc.status='active'
  )
);

create or replace function public.set_nutrition_tracking_mode(
  p_client_id uuid,
  p_mode text
) returns text
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_user uuid:=auth.uid();
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_mode not in ('meal_plan','calorie_tracking') then raise exception 'Unknown nutrition mode'; end if;

  if v_user<>p_client_id and not exists(
    select 1
    from public.coach_clients cc
    where cc.client_id=p_client_id
      and cc.coach_id=v_user
      and cc.status='active'
  ) then
    raise exception 'Access denied';
  end if;

  if p_mode='meal_plan' and not exists(
    select 1
    from public.nutrition_plans p
    where p.client_id=p_client_id and p.status='active'
  ) then
    raise exception 'Сначала нужен сохранённый Meal Plan.';
  end if;

  insert into public.client_nutrition_setup(
    client_id,tracking_mode,tracking_mode_changed_at,tracking_mode_changed_by
  ) values(
    p_client_id,p_mode,now(),v_user
  )
  on conflict(client_id) do update
  set tracking_mode=excluded.tracking_mode,
      tracking_mode_changed_at=now(),
      tracking_mode_changed_by=v_user,
      updated_at=now();

  return p_mode;
end;
$function$;

revoke all on function public.set_nutrition_tracking_mode(uuid,text) from public,anon;
grant execute on function public.set_nutrition_tracking_mode(uuid,text) to authenticated;
