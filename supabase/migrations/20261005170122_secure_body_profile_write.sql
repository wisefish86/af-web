create or replace function public.save_my_body_profile(
  p_height_cm numeric,
  p_wrist_cm numeric default null,
  p_ankle_cm numeric default null
) returns void
language plpgsql
security definer
set search_path=public,pg_catalog,pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  select role into v_role from public.profiles where id=v_uid;
  if v_role is distinct from 'client' then raise exception 'Body profile доступен только клиенту'; end if;

  if not exists(
    select 1 from public.coach_clients
    where client_id=v_uid and status='active'
  ) then raise exception 'Client access is inactive'; end if;

  if p_height_cm is null or p_height_cm < 100 or p_height_cm > 250 then
    raise exception 'Рост должен быть от 100 до 250 см';
  end if;
  if p_wrist_cm is not null and (p_wrist_cm < 10 or p_wrist_cm > 30) then
    raise exception 'Обхват запястья должен быть от 10 до 30 см';
  end if;
  if p_ankle_cm is not null and (p_ankle_cm < 12 or p_ankle_cm > 40) then
    raise exception 'Обхват лодыжки должен быть от 12 до 40 см';
  end if;

  update public.profiles
  set height_cm=p_height_cm,wrist_cm=p_wrist_cm,ankle_cm=p_ankle_cm,updated_at=now()
  where id=v_uid;

  if not found then raise exception 'Profile not found'; end if;

  update public.client_nutrition_setup
  set height_cm=p_height_cm,updated_at=now()
  where client_id=v_uid;
end;
$$;

revoke all on function public.save_my_body_profile(numeric,numeric,numeric) from public;
revoke all on function public.save_my_body_profile(numeric,numeric,numeric) from anon;
grant execute on function public.save_my_body_profile(numeric,numeric,numeric) to authenticated;
