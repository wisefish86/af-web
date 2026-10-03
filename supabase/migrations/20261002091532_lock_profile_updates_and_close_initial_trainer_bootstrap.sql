
create or replace function public.update_my_profile(
  p_display_name text,
  p_nickname text,
  p_age smallint,
  p_city text,
  p_timezone text,
  p_avatar_key text
) returns void
language plpgsql
security definer
set search_path to 'public','pg_catalog','pg_temp'
as $function$
declare
  v_user uuid:=auth.uid();
  v_name text:=nullif(btrim(p_display_name),'');
  v_nickname text:=nullif(btrim(p_nickname),'');
  v_city text:=nullif(btrim(p_city),'');
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if v_name is null then raise exception 'Укажи имя.'; end if;
  if length(v_name)>60 then raise exception 'Имя слишком длинное.'; end if;
  if v_nickname is not null and length(v_nickname)>40 then raise exception 'Метка слишком длинная.'; end if;
  if p_age is not null and (p_age<13 or p_age>100) then raise exception 'Возраст должен быть от 13 до 100 лет.'; end if;
  if v_city is not null and length(v_city)>80 then raise exception 'Название города слишком длинное.'; end if;
  if p_timezone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone) then
    raise exception 'Unknown timezone';
  end if;

  update public.profiles
  set display_name=v_name,
      nickname=v_nickname,
      age=p_age,
      city=v_city,
      timezone=p_timezone,
      avatar_key=nullif(btrim(p_avatar_key),''),
      updated_at=now()
  where id=v_user;

  if not found then raise exception 'Profile not found'; end if;
end;
$function$;

create or replace function public.complete_my_access_setup(p_display_name text)
returns text
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_user uuid:=auth.uid();
  v_name text:=nullif(btrim(p_display_name),'');
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if v_name is null then raise exception 'Укажи имя.'; end if;
  if length(v_name)>60 then raise exception 'Имя слишком длинное.'; end if;

  update public.profiles
  set display_name=v_name,
      must_set_password=false,
      updated_at=now()
  where id=v_user and role='client';

  if not found then raise exception 'Client profile not found'; end if;
  return v_name;
end;
$function$;

revoke update on public.profiles from anon,authenticated;

revoke all on function public.update_my_profile(text,text,smallint,text,text,text) from public,anon;
grant execute on function public.update_my_profile(text,text,smallint,text,text,text) to authenticated;

revoke all on function public.complete_my_access_setup(text) from public,anon;
grant execute on function public.complete_my_access_setup(text) to authenticated;

revoke all on function public.trainer_bootstrap_available() from public,anon,authenticated;
revoke all on function public.claim_initial_trainer() from public,anon,authenticated;
