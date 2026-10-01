alter table public.client_food_preferences
  drop constraint if exists client_food_preferences_custom_kcal_check,
  drop constraint if exists client_food_preferences_custom_protein_check,
  drop constraint if exists client_food_preferences_custom_fat_check,
  drop constraint if exists client_food_preferences_custom_carbs_check,
  drop constraint if exists client_food_preferences_custom_portion_check;

alter table public.client_food_preferences
  add constraint client_food_preferences_custom_kcal_check check (custom_kcal_100 is null or custom_kcal_100>=0),
  add constraint client_food_preferences_custom_protein_check check (custom_protein_100 is null or custom_protein_100>=0),
  add constraint client_food_preferences_custom_fat_check check (custom_fat_100 is null or custom_fat_100>=0),
  add constraint client_food_preferences_custom_carbs_check check (custom_carbs_100 is null or custom_carbs_100>=0),
  add constraint client_food_preferences_custom_portion_check check (custom_default_portion_g is null or custom_default_portion_g>0);

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
set search_path to 'public','pg_temp'
as $function$
declare v_user uuid:=auth.uid();
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.foods f where f.id=p_food_id and f.is_active=true) then
    raise exception 'Food not found';
  end if;
  if p_kcal_100 is not null and p_kcal_100<0 then raise exception 'Calories cannot be negative'; end if;
  if p_protein_100 is not null and p_protein_100<0 then raise exception 'Protein cannot be negative'; end if;
  if p_fat_100 is not null and p_fat_100<0 then raise exception 'Fat cannot be negative'; end if;
  if p_carbs_100 is not null and p_carbs_100<0 then raise exception 'Carbs cannot be negative'; end if;
  if p_default_portion_g is not null and p_default_portion_g<=0 then raise exception 'Portion must be positive'; end if;

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
$function$;
