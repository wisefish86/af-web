create or replace function public.save_my_monthly_progress(
  p_date date,
  p_chest_cm numeric default null,
  p_hips_cm numeric default null,
  p_thigh_cm numeric default null,
  p_arm_relaxed_cm numeric default null,
  p_arm_flexed_cm numeric default null,
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
returns jsonb
language plpgsql
set search_path to 'public','pg_temp'
as $function$
declare
  v_measurement_id uuid;
  v_checkin_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  v_measurement_id:=public.save_my_measurement(
    p_date,
    null,null,
    p_chest_cm,p_hips_cm,p_thigh_cm,p_arm_relaxed_cm,p_arm_flexed_cm,
    null
  );

  v_checkin_id:=public.save_my_monthly_checkin(
    p_date,p_appearance,p_fitness,p_physical_comfort,p_energy,p_sleep_recovery,
    p_nutrition,p_relationship_with_food,p_improve,p_next_step,p_keep,p_comment
  );

  return jsonb_build_object(
    'measurement_id',v_measurement_id,
    'checkin_id',v_checkin_id
  );
end;
$function$;

revoke execute on function public.save_my_monthly_progress(
  date,numeric,numeric,numeric,numeric,numeric,
  smallint,smallint,smallint,smallint,smallint,smallint,smallint,
  text,text,text,text
) from public,anon;
grant execute on function public.save_my_monthly_progress(
  date,numeric,numeric,numeric,numeric,numeric,
  smallint,smallint,smallint,smallint,smallint,smallint,smallint,
  text,text,text,text
) to authenticated;
