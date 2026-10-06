-- Verify read-only RPCs still work under authenticated RLS after SECURITY INVOKER.
-- No data is changed.

begin;

do $$
declare
  v_trainer uuid;
  v_client uuid;
  v_workout_exercise uuid;
  v_json jsonb;
  v_plan_count integer;
begin
  select cc.coach_id,cc.client_id
  into v_trainer,v_client
  from public.coach_clients cc
  where cc.status='active'
  order by cc.started_at desc nulls last
  limit 1;

  if v_trainer is null or v_client is null then
    raise exception 'QA security smoke requires one active coach/client relation';
  end if;

  select we.id
  into v_workout_exercise
  from public.workout_exercises we
  join public.workout_sessions ws on ws.id=we.workout_session_id
  where ws.client_id=v_client
  order by ws.started_at desc,we.sort_order
  limit 1;

  if v_workout_exercise is null then
    raise exception 'QA security smoke requires one client workout exercise';
  end if;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_client,'role','authenticated')::text,true);
  set local role authenticated;
  select public.get_workout_load_recommendation(v_workout_exercise) into v_json;
  if v_json is null then
    raise exception 'Workout recommendation RPC returned null unexpectedly';
  end if;

  reset role;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_trainer,'role','authenticated')::text,true);
  set local role authenticated;
  select count(*) into v_plan_count
  from public.get_trainer_client_nutrition_plans(v_client);
  if v_plan_count < 0 then
    raise exception 'Unreachable count guard';
  end if;

  reset role;
end $$;

rollback;
