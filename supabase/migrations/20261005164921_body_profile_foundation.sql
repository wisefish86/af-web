alter table public.profiles
  add column if not exists height_cm numeric(5,1),
  add column if not exists wrist_cm numeric(4,1),
  add column if not exists ankle_cm numeric(4,1);

do $$ begin
  alter table public.profiles add constraint profiles_height_cm_check check (height_cm is null or height_cm between 100 and 250);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.profiles add constraint profiles_wrist_cm_check check (wrist_cm is null or wrist_cm between 10 and 30);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.profiles add constraint profiles_ankle_cm_check check (ankle_cm is null or ankle_cm between 12 and 40);
exception when duplicate_object then null; end $$;

update public.profiles p
set height_cm=n.height_cm
from public.client_nutrition_setup n
where n.client_id=p.id
  and p.height_cm is null
  and n.height_cm is not null;

create or replace function public.save_my_body_profile(
  p_height_cm numeric,
  p_wrist_cm numeric default null,
  p_ankle_cm numeric default null
) returns void
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_height_cm is not null and (p_height_cm < 100 or p_height_cm > 250) then
    raise exception 'Height must be between 100 and 250 cm';
  end if;
  if p_wrist_cm is not null and (p_wrist_cm < 10 or p_wrist_cm > 30) then
    raise exception 'Wrist must be between 10 and 30 cm';
  end if;
  if p_ankle_cm is not null and (p_ankle_cm < 12 or p_ankle_cm > 40) then
    raise exception 'Ankle must be between 12 and 40 cm';
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
grant execute on function public.save_my_body_profile(numeric,numeric,numeric) to authenticated;
