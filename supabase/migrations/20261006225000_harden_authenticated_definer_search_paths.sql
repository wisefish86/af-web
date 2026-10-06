alter function public.add_workout_comment_v2(uuid,text,uuid)
  set search_path to pg_catalog, public, private;
alter function public.assign_nutrition_template(uuid,uuid)
  set search_path to pg_catalog, public;
alter function public.complete_my_access_setup(text)
  set search_path to pg_catalog, public;
alter function public.create_my_meal_plan(integer,uuid[])
  set search_path to pg_catalog, public;
alter function public.get_trainer_client_nutrition_plans(uuid)
  set search_path to pg_catalog, public;
alter function public.get_workout_load_recommendation(uuid)
  set search_path to pg_catalog, public;
alter function public.publish_nutrition_plan(uuid)
  set search_path to pg_catalog, public;
alter function public.reply_to_feedback_v2(uuid,text,uuid)
  set search_path to pg_catalog, public, private;
alter function public.save_my_body_profile(numeric,numeric,numeric)
  set search_path to pg_catalog, public;
alter function public.save_my_meal_plan_version(uuid,integer,jsonb)
  set search_path to pg_catalog, public, private;
alter function public.save_my_nutrition_setup_v3(text,numeric,numeric,integer,text,integer,integer,integer,integer,text,text)
  set search_path to pg_catalog, public;
alter function public.save_my_trainer_contact_settings(jsonb)
  set search_path to pg_catalog, public;
alter function public.set_nutrition_tracking_mode(uuid,text)
  set search_path to pg_catalog, public;
alter function public.update_my_profile(text,text,smallint,text,text,text)
  set search_path to pg_catalog, public;
