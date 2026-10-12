-- Coaching journal schema: macros, carbs target and private progress photos.
do $$
begin
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='client_targets' and column_name='carbs_target_g') then
    raise exception 'client_targets.carbs_target_g missing';
  end if;

  if not exists(select 1 from public.tracking_fields where code='fat' and section='daily')
     or not exists(select 1 from public.tracking_fields where code='carbs' and section='daily') then
    raise exception 'fat/carbs tracking fields missing';
  end if;

  if to_regclass('public.progress_photos') is null then
    raise exception 'progress_photos table missing';
  end if;

  if not exists(select 1 from storage.buckets where id='progress-photos' and public=false) then
    raise exception 'private progress-photos bucket missing';
  end if;

  if to_regprocedure('public.save_my_nutrition_checkin_v2(date,text,text,text,integer,numeric,numeric,numeric,uuid)') is null then
    raise exception 'nutrition v2 RPC missing';
  end if;

  if to_regprocedure('public.save_my_wellbeing_checkin_v2(date,smallint,smallint,smallint,smallint,smallint,integer,text)') is null then
    raise exception 'wellbeing v2 RPC missing';
  end if;

  if not exists(select 1 from pg_trigger where tgname='workout_session_sync_daily_trained' and not tgisinternal) then
    raise exception 'workout -> daily trained trigger missing';
  end if;
end $$;
