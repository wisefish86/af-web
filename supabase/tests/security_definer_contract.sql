-- Security contract for browser-callable SECURITY DEFINER functions.
-- Any new privileged public RPC must be reviewed and added explicitly.

do $$
declare
  v_expected text[]:=array[
    'abandon_my_empty_workout(uuid)',
    'add_workout_comment_v2(uuid,text,uuid)',
    'assign_nutrition_template(uuid,uuid)',
    'complete_my_access_setup(text)',
    'complete_my_workout_cardio(uuid,integer,integer,numeric,numeric,text)',
    'complete_my_workout_exercise(uuid)',
    'complete_workout_v2(uuid,text,jsonb)',
    'create_my_meal_plan(integer,uuid[])',
    'delete_my_workout_set(uuid,integer)',
    'get_trainer_client_nutrition_plans(uuid)',
    'get_workout_load_recommendation(uuid)',
    'publish_nutrition_plan(uuid)',
    'reopen_my_workout_cardio(uuid)',
    'reopen_my_workout_exercise(uuid)',
    'reopen_my_workout_set(uuid,integer)',
    'reopen_my_workout(uuid)',
    'replace_workout_exercise(uuid,uuid)',
    'reply_to_feedback_v2(uuid,text,uuid)',
    'save_my_body_profile(numeric,numeric,numeric)',
    'save_my_meal_plan_version(uuid,integer,jsonb)',
    'save_my_nutrition_setup_v3(text,numeric,numeric,integer,text,integer,integer,integer,integer,text,text)',
    'save_my_trainer_contact_settings(jsonb)',
    'save_workout_set(uuid,integer,numeric,integer,numeric,boolean,timestamp with time zone)',
    'save_workout_ui_state(uuid,uuid,timestamp with time zone,text)',
    'set_nutrition_tracking_mode(uuid,text)',
    'start_workout(uuid)',
    'update_my_profile(text,text,smallint,text,text,text)'
  ];
  v_actual text[];
  v_bad_path text[];
  v_anon text[];
begin
  select array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text)
  into v_actual
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.prosecdef
    and has_function_privilege('authenticated',p.oid,'EXECUTE');

  select array_agg(x order by x) into v_expected
  from unnest(v_expected) x;

  if v_actual is distinct from v_expected then
    raise exception 'Authenticated SECURITY DEFINER allowlist drift. actual=%, expected=%',v_actual,v_expected;
  end if;

  select array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text)
  into v_anon
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.prosecdef
    and has_function_privilege('anon',p.oid,'EXECUTE');

  if coalesce(cardinality(v_anon),0)<>0 then
    raise exception 'Anonymous SECURITY DEFINER exposure: %',v_anon;
  end if;

  select array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text)
  into v_bad_path
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.prosecdef
    and has_function_privilege('authenticated',p.oid,'EXECUTE')
    and (
      coalesce(array_to_string(p.proconfig,','),'') not like 'search_path=pg_catalog%'
      or coalesce(array_to_string(p.proconfig,','),'') like '%pg_temp%'
    );

  if coalesce(cardinality(v_bad_path),0)<>0 then
    raise exception 'Unsafe authenticated SECURITY DEFINER search_path: %',v_bad_path;
  end if;
end $$;
