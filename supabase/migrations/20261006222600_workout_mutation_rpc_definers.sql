alter function public.start_workout(uuid) security definer;
alter function public.start_workout(uuid) set search_path to pg_catalog, public;

alter function public.abandon_my_empty_workout(uuid) security definer;
alter function public.abandon_my_empty_workout(uuid) set search_path to pg_catalog, public;

alter function public.reopen_my_workout(uuid) security definer;
alter function public.reopen_my_workout(uuid) set search_path to pg_catalog, public;

alter function public.save_workout_set(uuid,integer,numeric,integer,numeric,boolean,timestamptz) security definer;
alter function public.save_workout_set(uuid,integer,numeric,integer,numeric,boolean,timestamptz) set search_path to pg_catalog, public;

alter function public.delete_my_workout_set(uuid,integer) security definer;
alter function public.delete_my_workout_set(uuid,integer) set search_path to pg_catalog, public;

alter function public.reopen_my_workout_set(uuid,integer) security definer;
alter function public.reopen_my_workout_set(uuid,integer) set search_path to pg_catalog, public;

alter function public.replace_workout_exercise(uuid,uuid) security definer;
alter function public.replace_workout_exercise(uuid,uuid) set search_path to pg_catalog, public;

alter function public.complete_workout_v2(uuid,text,jsonb) security definer;
alter function public.complete_workout_v2(uuid,text,jsonb) set search_path to pg_catalog, public;

alter function public.save_workout_ui_state(uuid,uuid,timestamptz,text) security definer;
alter function public.save_workout_ui_state(uuid,uuid,timestamptz,text) set search_path to pg_catalog, public;

alter function public.complete_my_workout_exercise(uuid) security definer;
alter function public.complete_my_workout_exercise(uuid) set search_path to pg_catalog, public;

alter function public.reopen_my_workout_exercise(uuid) security definer;
alter function public.reopen_my_workout_exercise(uuid) set search_path to pg_catalog, public;

alter function public.complete_my_workout_cardio(uuid,integer,integer,numeric,numeric,text) security definer;
alter function public.complete_my_workout_cardio(uuid,integer,integer,numeric,numeric,text) set search_path to pg_catalog, public;

alter function public.reopen_my_workout_cardio(uuid) security definer;
alter function public.reopen_my_workout_cardio(uuid) set search_path to pg_catalog, public;
