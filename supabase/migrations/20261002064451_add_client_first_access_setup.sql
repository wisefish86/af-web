
alter table public.profiles
  add column if not exists must_set_password boolean not null default false;

create or replace function public.complete_my_access_setup(p_display_name text)
returns text
language plpgsql
security invoker
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

revoke all on function public.complete_my_access_setup(text) from public,anon;
grant execute on function public.complete_my_access_setup(text) to authenticated;
