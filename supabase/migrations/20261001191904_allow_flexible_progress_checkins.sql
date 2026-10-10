
create or replace function public.save_my_monthly_checkin(
  p_date date,
  p_appearance smallint default null,
  p_fitness smallint default null,
  p_physical_comfort smallint default null,
  p_energy smallint default null,
  p_sleep_recovery smallint default null,
  p_nutrition smallint default null,
  p_relationship_with_food smallint default null,
  p_improve text default null,
  p_next_step text default null,
  p_keep text default null,
  p_comment text default null
) returns uuid
language plpgsql
set search_path to 'public','pg_temp'
as $function$
declare
  v_user uuid:=auth.uid();
  v_checkin_date date:=coalesce(p_date,current_date);
  v_id uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  insert into public.monthly_checkins(
    client_id,checkin_date,appearance,fitness,physical_comfort,energy,sleep_recovery,
    nutrition,relationship_with_food,improve,next_step,keep,comment
  ) values (
    v_user,v_checkin_date,p_appearance,p_fitness,p_physical_comfort,p_energy,p_sleep_recovery,
    p_nutrition,p_relationship_with_food,nullif(btrim(p_improve),''),nullif(btrim(p_next_step),''),
    nullif(btrim(p_keep),''),nullif(btrim(p_comment),'')
  )
  on conflict(client_id,checkin_date) do update
  set appearance=excluded.appearance,
      fitness=excluded.fitness,
      physical_comfort=excluded.physical_comfort,
      energy=excluded.energy,
      sleep_recovery=excluded.sleep_recovery,
      nutrition=excluded.nutrition,
      relationship_with_food=excluded.relationship_with_food,
      improve=excluded.improve,
      next_step=excluded.next_step,
      keep=excluded.keep,
      comment=excluded.comment
  returning id into v_id;

  return v_id;
end;
$function$;
