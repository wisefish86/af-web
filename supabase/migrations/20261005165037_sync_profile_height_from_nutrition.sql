create or replace function public.sync_profile_height_from_nutrition_setup()
returns trigger
language plpgsql
security invoker
set search_path=public
as $$
begin
  if new.height_cm is distinct from old.height_cm or tg_op='INSERT' then
    update public.profiles
    set height_cm=new.height_cm,updated_at=now()
    where id=new.client_id and height_cm is distinct from new.height_cm;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_profile_height_from_nutrition_setup on public.client_nutrition_setup;
create trigger sync_profile_height_from_nutrition_setup
after insert or update of height_cm on public.client_nutrition_setup
for each row execute function public.sync_profile_height_from_nutrition_setup();
