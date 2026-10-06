-- Historical coach RLS regression smoke. No values are exposed; only row counts
-- are compared. The coach/client relation change is rolled back.

begin;

do $$
declare
  v_trainer uuid;
  v_client uuid;
  v_profile_active integer;
  v_profile_finished integer;
  v_workouts_active integer;
  v_workouts_finished integer;
  v_measurements_active integer;
  v_measurements_finished integer;
  v_checkins_active integer;
  v_checkins_finished integer;
  v_nutrition_active integer;
  v_nutrition_finished integer;
  v_feedback_active integer;
  v_feedback_finished integer;
begin
  select cc.coach_id,cc.client_id
  into v_trainer,v_client
  from public.coach_clients cc
  join public.profiles t on t.id=cc.coach_id and t.role='trainer'
  join public.profiles c on c.id=cc.client_id and c.role='client'
  where cc.status='active'
  order by cc.started_at
  limit 1;

  if v_trainer is null or v_client is null then
    raise exception 'QA historical RLS smoke requires one active trainer/client pair';
  end if;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_trainer,'role','authenticated')::text,true);
  set local role authenticated;

  select count(*) into v_profile_active from public.profiles where id=v_client;
  select count(*) into v_workouts_active from public.workout_sessions where client_id=v_client;
  select count(*) into v_measurements_active from public.measurements where client_id=v_client;
  select count(*) into v_checkins_active from public.monthly_checkins where client_id=v_client;
  select count(*) into v_nutrition_active from public.nutrition_plans where client_id=v_client;
  select count(*) into v_feedback_active from public.feedback_threads where client_id=v_client;

  if v_profile_active<>1 then
    raise exception 'Active coach cannot read assigned client profile';
  end if;

  reset role;
  update public.coach_clients
  set status='finished'
  where coach_id=v_trainer and client_id=v_client;

  set local role authenticated;

  select count(*) into v_profile_finished from public.profiles where id=v_client;
  select count(*) into v_workouts_finished from public.workout_sessions where client_id=v_client;
  select count(*) into v_measurements_finished from public.measurements where client_id=v_client;
  select count(*) into v_checkins_finished from public.monthly_checkins where client_id=v_client;
  select count(*) into v_nutrition_finished from public.nutrition_plans where client_id=v_client;
  select count(*) into v_feedback_finished from public.feedback_threads where client_id=v_client;

  if v_profile_finished<>v_profile_active
     or v_workouts_finished<>v_workouts_active
     or v_measurements_finished<>v_measurements_active
     or v_checkins_finished<>v_checkins_active
     or v_nutrition_finished<>v_nutrition_active
     or v_feedback_finished<>v_feedback_active then
    raise exception 'Historical coach read semantics changed after relationship finished';
  end if;

  begin
    perform public.set_nutrition_tracking_mode(v_client,'calorie_tracking');
    raise exception 'EXPECTED_FINISHED_COACH_WRITE_REJECTION_MISSING';
  exception when others then
    if sqlerrm='EXPECTED_FINISHED_COACH_WRITE_REJECTION_MISSING' then raise; end if;
  end;

  reset role;
end $$;

rollback;
