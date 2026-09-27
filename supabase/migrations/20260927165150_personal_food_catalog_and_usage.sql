alter table public.client_food_preferences
  add column if not exists custom_fat_100 numeric,
  add column if not exists custom_carbs_100 numeric,
  add column if not exists usage_count integer not null default 0,
  add column if not exists last_used_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.client_food_preferences'::regclass
      and conname='client_food_preferences_usage_count_check'
  ) then
    alter table public.client_food_preferences
      add constraint client_food_preferences_usage_count_check check (usage_count>=0);
  end if;
end $$;

create table if not exists public.client_foods(
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete restrict,
  name text not null,
  kcal_100 numeric not null,
  protein_100 numeric not null default 0,
  fat_100 numeric not null default 0,
  carbs_100 numeric not null default 0,
  default_portion_g numeric,
  is_favorite boolean not null default true,
  usage_count integer not null default 0,
  last_used_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_foods_name_check check (char_length(btrim(name)) between 1 and 120),
  constraint client_foods_usage_count_check check (usage_count>=0),
  constraint client_foods_macros_check check (
    kcal_100>=0 and protein_100>=0 and fat_100>=0 and carbs_100>=0
    and (default_portion_g is null or default_portion_g>0)
  )
);

create unique index if not exists client_foods_name_uq
  on public.client_foods(client_id,lower(btrim(name)))
  where is_active=true;

create index if not exists client_foods_client_rank_idx
  on public.client_foods(client_id,is_favorite desc,usage_count desc,last_used_at desc)
  where is_active=true;

alter table public.client_foods enable row level security;
revoke all on public.client_foods from anon;
grant select,insert,update on public.client_foods to authenticated;

drop policy if exists client_foods_owner_all on public.client_foods;
create policy client_foods_owner_all on public.client_foods
for all to authenticated
using (client_id=(select auth.uid()))
with check (client_id=(select auth.uid()));

drop policy if exists client_foods_coach_read on public.client_foods;
create policy client_foods_coach_read on public.client_foods
for select to authenticated
using (
  exists(
    select 1 from public.coach_clients cc
    where cc.client_id=client_foods.client_id
      and cc.coach_id=(select auth.uid())
      and cc.status='active'
  )
);

create or replace function public.record_my_food_use(
  p_food_id uuid default null,
  p_client_food_id uuid default null
)
returns void
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare v_user uuid:=auth.uid();
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if (p_food_id is null)=(p_client_food_id is null) then
    raise exception 'Provide exactly one food id';
  end if;

  if p_food_id is not null then
    insert into public.client_food_preferences(client_id,food_id,preference,is_enabled,usage_count,last_used_at)
    values(v_user,p_food_id,'allowed',true,1,now())
    on conflict(client_id,food_id) do update
    set usage_count=client_food_preferences.usage_count+1,
        last_used_at=now(),
        updated_at=now();
  else
    update public.client_foods
    set usage_count=usage_count+1,last_used_at=now(),updated_at=now()
    where id=p_client_food_id and client_id=v_user and is_active=true;
    if not found then raise exception 'Personal food not found'; end if;
  end if;
end;
$$;

create or replace function public.save_my_food_override(
  p_food_id uuid,
  p_kcal_100 numeric default null,
  p_protein_100 numeric default null,
  p_fat_100 numeric default null,
  p_carbs_100 numeric default null,
  p_default_portion_g numeric default null
)
returns void
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare v_user uuid:=auth.uid();
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.foods f where f.id=p_food_id and f.is_active=true) then
    raise exception 'Food not found';
  end if;

  insert into public.client_food_preferences(
    client_id,food_id,preference,is_enabled,
    custom_kcal_100,custom_protein_100,custom_fat_100,custom_carbs_100,custom_default_portion_g,updated_at
  )
  values(
    v_user,p_food_id,'allowed',true,
    p_kcal_100,p_protein_100,p_fat_100,p_carbs_100,p_default_portion_g,now()
  )
  on conflict(client_id,food_id) do update
  set custom_kcal_100=excluded.custom_kcal_100,
      custom_protein_100=excluded.custom_protein_100,
      custom_fat_100=excluded.custom_fat_100,
      custom_carbs_100=excluded.custom_carbs_100,
      custom_default_portion_g=excluded.custom_default_portion_g,
      updated_at=now();
end;
$$;

create or replace function public.clear_my_food_override(p_food_id uuid)
returns void
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
begin
  update public.client_food_preferences
  set custom_kcal_100=null,
      custom_protein_100=null,
      custom_fat_100=null,
      custom_carbs_100=null,
      custom_default_portion_g=null,
      updated_at=now()
  where client_id=(select auth.uid()) and food_id=p_food_id;
end;
$$;

revoke all on function public.record_my_food_use(uuid,uuid) from public,anon;
revoke all on function public.save_my_food_override(uuid,numeric,numeric,numeric,numeric,numeric) from public,anon;
revoke all on function public.clear_my_food_override(uuid) from public,anon;
grant execute on function public.record_my_food_use(uuid,uuid) to authenticated;
grant execute on function public.save_my_food_override(uuid,numeric,numeric,numeric,numeric,numeric) to authenticated;
grant execute on function public.clear_my_food_override(uuid) to authenticated;
