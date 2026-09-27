
-- Client profile + nutrition adherence model for pilot users.

alter table public.profiles
  add column if not exists login_alias text,
  add column if not exists nickname text,
  add column if not exists age smallint,
  add column if not exists city text,
  add column if not exists avatar_key text;

create unique index if not exists profiles_login_alias_uq
  on public.profiles(lower(login_alias))
  where login_alias is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.profiles'::regclass and conname='profiles_age_check'
  ) then
    alter table public.profiles
      add constraint profiles_age_check check (age is null or age between 13 and 100);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.profiles'::regclass and conname='profiles_nickname_length_check'
  ) then
    alter table public.profiles
      add constraint profiles_nickname_length_check check (nickname is null or char_length(btrim(nickname)) between 1 and 40);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.profiles'::regclass and conname='profiles_city_length_check'
  ) then
    alter table public.profiles
      add constraint profiles_city_length_check check (city is null or char_length(btrim(city)) between 1 and 80);
  end if;
end $$;

-- On the pilot we use neutral built-in avatars, not user-uploaded photo URLs.
revoke update(avatar_url) on public.profiles from authenticated;
grant update(display_name,nickname,age,city,timezone,avatar_key) on public.profiles to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into public.profiles (
    id, display_name, role, login_alias, nickname, age, city, avatar_key
  )
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(coalesce(new.email, 'Пользователь'), '@', 1)),
    'client',
    nullif(new.raw_user_meta_data ->> 'login_alias',''),
    nullif(new.raw_user_meta_data ->> 'nickname',''),
    nullif(new.raw_user_meta_data ->> 'age','')::smallint,
    nullif(new.raw_user_meta_data ->> 'city',''),
    nullif(new.raw_user_meta_data ->> 'avatar_key','')
  );
  return new;
end;
$$;

alter table public.daily_checkins
  add column if not exists nutrition_mode text,
  add column if not exists nutrition_adherence text,
  add column if not exists nutrition_plan_id uuid references public.nutrition_plans(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.daily_checkins'::regclass and conname='daily_checkins_nutrition_mode_check'
  ) then
    alter table public.daily_checkins
      add constraint daily_checkins_nutrition_mode_check
      check (nutrition_mode is null or nutrition_mode in ('meal_plan','manual'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.daily_checkins'::regclass and conname='daily_checkins_nutrition_adherence_check'
  ) then
    alter table public.daily_checkins
      add constraint daily_checkins_nutrition_adherence_check
      check (nutrition_adherence is null or nutrition_adherence in ('followed','partial','not_followed'));
  end if;
end $$;

create index if not exists daily_checkins_nutrition_plan_idx
  on public.daily_checkins(nutrition_plan_id);

-- Store a daily nutrition check-in without forcing macros when a meal plan is used.
create or replace function public.save_my_nutrition_checkin(
  p_date date,
  p_mode text,
  p_adherence text default null,
  p_calories integer default null,
  p_protein_g numeric default null,
  p_plan_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_mode not in ('meal_plan','manual') then raise exception 'Invalid nutrition mode'; end if;

  if p_mode='meal_plan' then
    if p_adherence is null or p_adherence not in ('followed','partial','not_followed') then
      raise exception 'Adherence is required for meal-plan mode';
    end if;
    if p_plan_id is not null and not exists (
      select 1 from public.nutrition_plans p
      where p.id=p_plan_id and p.client_id=v_user and p.status in ('active','archived')
    ) then
      raise exception 'Nutrition plan not available';
    end if;
  else
    p_adherence := null;
    p_plan_id := null;
  end if;

  insert into public.daily_checkins(
    client_id,checkin_date,nutrition_mode,nutrition_adherence,
    calories,protein_g,nutrition_plan_id
  ) values (
    v_user,coalesce(p_date,current_date),p_mode,p_adherence,
    p_calories,p_protein_g,p_plan_id
  )
  on conflict (client_id,checkin_date) do update
  set nutrition_mode=excluded.nutrition_mode,
      nutrition_adherence=excluded.nutrition_adherence,
      calories=excluded.calories,
      protein_g=excluded.protein_g,
      nutrition_plan_id=excluded.nutrition_plan_id
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.save_my_nutrition_checkin(date,text,text,integer,numeric,uuid) from public,anon;
grant execute on function public.save_my_nutrition_checkin(date,text,text,integer,numeric,uuid) to authenticated;
