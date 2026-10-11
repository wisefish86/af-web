create or replace function public.complete_my_access_setup_v2(
  p_display_name text,
  p_nickname text default null,
  p_age integer default null
)
returns text
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_user uuid:=auth.uid();
  v_name text:=nullif(btrim(p_display_name),'');
  v_nickname text:=nullif(btrim(coalesce(p_nickname,'')),'');
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if v_name is null then raise exception 'Укажи имя.'; end if;
  if length(v_name)>60 then raise exception 'Имя слишком длинное.'; end if;
  if v_nickname is not null and length(v_nickname)>40 then raise exception 'Метка слишком длинная.'; end if;
  if p_age is not null and (p_age<13 or p_age>100) then raise exception 'Возраст должен быть от 13 до 100 лет.'; end if;

  update public.profiles
  set display_name=v_name,
      nickname=v_nickname,
      age=p_age,
      must_set_password=false,
      updated_at=now()
  where id=v_user and role='client';

  if not found then raise exception 'Client profile not found'; end if;
  return v_name;
end;
$function$;

revoke all on function public.complete_my_access_setup_v2(text,text,integer) from public,anon;
grant execute on function public.complete_my_access_setup_v2(text,text,integer) to authenticated;
