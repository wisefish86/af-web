create or replace function public.save_my_wellbeing_checkin(
  p_date date,
  p_hunger smallint default null,
  p_energy smallint default null,
  p_stress smallint default null,
  p_sleep smallint default null,
  p_ease smallint default null,
  p_comment text default null
)
returns uuid
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare v_user uuid:=auth.uid(); v_id uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  insert into public.daily_checkins(client_id,checkin_date,hunger,energy,stress,sleep,ease,comment)
  values(v_user,coalesce(p_date,current_date),p_hunger,p_energy,p_stress,p_sleep,p_ease,nullif(btrim(p_comment),''))
  on conflict(client_id,checkin_date) do update
  set hunger=excluded.hunger,energy=excluded.energy,stress=excluded.stress,sleep=excluded.sleep,ease=excluded.ease,comment=excluded.comment
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.save_my_measurement(
  p_date date,
  p_weight_kg numeric default null,
  p_waist_cm numeric default null,
  p_chest_cm numeric default null,
  p_hips_cm numeric default null,
  p_thigh_cm numeric default null,
  p_arm_relaxed_cm numeric default null,
  p_arm_flexed_cm numeric default null,
  p_note text default null
)
returns uuid
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare v_user uuid:=auth.uid(); v_id uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  insert into public.measurements(client_id,measured_at,weight_kg,waist_cm,chest_cm,hips_cm,thigh_cm,arm_relaxed_cm,arm_flexed_cm,note)
  values(v_user,coalesce(p_date,current_date),p_weight_kg,p_waist_cm,p_chest_cm,p_hips_cm,p_thigh_cm,p_arm_relaxed_cm,p_arm_flexed_cm,nullif(btrim(p_note),''))
  on conflict(client_id,measured_at) do update
  set weight_kg=coalesce(excluded.weight_kg,measurements.weight_kg),
      waist_cm=coalesce(excluded.waist_cm,measurements.waist_cm),
      chest_cm=coalesce(excluded.chest_cm,measurements.chest_cm),
      hips_cm=coalesce(excluded.hips_cm,measurements.hips_cm),
      thigh_cm=coalesce(excluded.thigh_cm,measurements.thigh_cm),
      arm_relaxed_cm=coalesce(excluded.arm_relaxed_cm,measurements.arm_relaxed_cm),
      arm_flexed_cm=coalesce(excluded.arm_flexed_cm,measurements.arm_flexed_cm),
      note=case when excluded.note is not null then excluded.note else measurements.note end
  returning id into v_id;
  return v_id;
end;
$$;

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
)
returns uuid
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_user uuid:=auth.uid();
  v_month_date date:=date_trunc('month',coalesce(p_date,current_date))::date;
  v_id uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  insert into public.monthly_checkins(
    client_id,checkin_date,appearance,fitness,physical_comfort,energy,sleep_recovery,
    nutrition,relationship_with_food,improve,next_step,keep,comment
  ) values (
    v_user,v_month_date,p_appearance,p_fitness,p_physical_comfort,p_energy,p_sleep_recovery,
    p_nutrition,p_relationship_with_food,nullif(btrim(p_improve),''),nullif(btrim(p_next_step),''),
    nullif(btrim(p_keep),''),nullif(btrim(p_comment),'')
  )
  on conflict(client_id,checkin_date) do update
  set appearance=excluded.appearance,fitness=excluded.fitness,physical_comfort=excluded.physical_comfort,
      energy=excluded.energy,sleep_recovery=excluded.sleep_recovery,nutrition=excluded.nutrition,
      relationship_with_food=excluded.relationship_with_food,improve=excluded.improve,
      next_step=excluded.next_step,keep=excluded.keep,comment=excluded.comment
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.save_my_wellbeing_checkin(date,smallint,smallint,smallint,smallint,smallint,text) from public,anon;
revoke all on function public.save_my_measurement(date,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text) from public,anon;
revoke all on function public.save_my_monthly_checkin(date,smallint,smallint,smallint,smallint,smallint,smallint,smallint,text,text,text,text) from public,anon;

grant execute on function public.save_my_wellbeing_checkin(date,smallint,smallint,smallint,smallint,smallint,text) to authenticated;
grant execute on function public.save_my_measurement(date,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text) to authenticated;
grant execute on function public.save_my_monthly_checkin(date,smallint,smallint,smallint,smallint,smallint,smallint,smallint,text,text,text,text) to authenticated;
