-- Transactional access-boundary smoke for privileged RPCs.
-- Uses one existing trainer/client pair and rolls every temporary change back.

begin;

do $$
declare
  v_trainer uuid;
  v_client uuid;
  v_template uuid;
  v_active_plan uuid;
  v_workout_exercise uuid;
  v_food uuid;
  v_count_before integer;
  v_count_after integer;
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
    raise exception 'QA role-boundary smoke requires one active trainer/client pair';
  end if;

  select id into v_template
  from public.nutrition_plans
  where client_id is null and created_by=v_trainer
  order by created_at
  limit 1;

  select id into v_active_plan
  from public.nutrition_plans
  where client_id=v_client and status='active'
  order by updated_at desc
  limit 1;

  select we.id into v_workout_exercise
  from public.workout_exercises we
  join public.workout_sessions ws on ws.id=we.workout_session_id
  where ws.client_id=v_client
  order by ws.started_at desc,we.sort_order
  limit 1;

  select id into v_food from public.foods where is_active=true order by created_at limit 1;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_client,'role','authenticated')::text,true);

  begin
    perform public.save_my_trainer_contact_settings('{}'::jsonb);
    raise exception 'QA_EXPECTED_CLIENT_TRAINER_CONTACT_REJECTION_MISSING';
  exception when others then
    if sqlerrm='QA_EXPECTED_CLIENT_TRAINER_CONTACT_REJECTION_MISSING' then raise; end if;
  end;

  if v_template is not null then
    begin
      perform public.assign_nutrition_template(v_template,v_client);
      raise exception 'QA_EXPECTED_CLIENT_ASSIGN_TEMPLATE_REJECTION_MISSING';
    exception when others then
      if sqlerrm='QA_EXPECTED_CLIENT_ASSIGN_TEMPLATE_REJECTION_MISSING' then raise; end if;
    end;
  end if;

  select count(*) into v_count_before
  from public.get_trainer_client_nutrition_plans(v_client);
  if v_count_before<>0 then
    raise exception 'Client unexpectedly read trainer-only nutrition plan listing';
  end if;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_trainer,'role','authenticated')::text,true);

  begin
    perform public.complete_my_access_setup('QA trainer');
    raise exception 'QA_EXPECTED_TRAINER_FIRST_ACCESS_REJECTION_MISSING';
  exception when others then
    if sqlerrm='QA_EXPECTED_TRAINER_FIRST_ACCESS_REJECTION_MISSING' then raise; end if;
  end;

  if v_food is not null then
    begin
      perform public.create_my_meal_plan(3,array[v_food]);
      raise exception 'QA_EXPECTED_TRAINER_MEAL_PLAN_REJECTION_MISSING';
    exception when others then
      if sqlerrm='QA_EXPECTED_TRAINER_MEAL_PLAN_REJECTION_MISSING' then raise; end if;
    end;
  end if;

  begin
    perform public.save_my_body_profile(null,null,null);
    raise exception 'QA_EXPECTED_TRAINER_BODY_PROFILE_REJECTION_MISSING';
  exception when others then
    if sqlerrm='QA_EXPECTED_TRAINER_BODY_PROFILE_REJECTION_MISSING' then raise; end if;
  end;

  begin
    perform public.save_my_nutrition_setup_v3('male',180,80,8000,'mixed',3,60,1,30,'moderate','maintain');
    raise exception 'QA_EXPECTED_TRAINER_NUTRITION_SETUP_REJECTION_MISSING';
  exception when others then
    if sqlerrm='QA_EXPECTED_TRAINER_NUTRITION_SETUP_REJECTION_MISSING' then raise; end if;
  end;

  if v_active_plan is not null then
    begin
      perform public.save_my_meal_plan_version(v_active_plan,250,'[]'::jsonb);
      raise exception 'QA_EXPECTED_TRAINER_CLIENT_PLAN_EDIT_REJECTION_MISSING';
    exception when others then
      if sqlerrm='QA_EXPECTED_TRAINER_CLIENT_PLAN_EDIT_REJECTION_MISSING' then raise; end if;
    end;
  end if;

  if v_workout_exercise is not null then
    begin
      perform public.get_workout_load_recommendation(v_workout_exercise);
      raise exception 'QA_EXPECTED_TRAINER_CLIENT_LOAD_RECOMMENDATION_REJECTION_MISSING';
    exception when others then
      if sqlerrm='QA_EXPECTED_TRAINER_CLIENT_LOAD_RECOMMENDATION_REJECTION_MISSING' then raise; end if;
    end;

    begin
      perform public.add_workout_comment_v2(v_workout_exercise,'QA unauthorized trainer comment',gen_random_uuid());
      raise exception 'QA_EXPECTED_TRAINER_CLIENT_COMMENT_REJECTION_MISSING';
    exception when others then
      if sqlerrm='QA_EXPECTED_TRAINER_CLIENT_COMMENT_REJECTION_MISSING' then raise; end if;
    end;
  end if;

  select count(*) into v_count_before
  from public.get_trainer_client_nutrition_plans(v_client);

  update public.coach_clients
  set status='finished'
  where coach_id=v_trainer and client_id=v_client;

  if v_template is not null then
    begin
      perform public.assign_nutrition_template(v_template,v_client);
      raise exception 'QA_EXPECTED_FINISHED_COACH_ASSIGN_REJECTION_MISSING';
    exception when others then
      if sqlerrm='QA_EXPECTED_FINISHED_COACH_ASSIGN_REJECTION_MISSING' then raise; end if;
    end;
  end if;

  begin
    perform public.set_nutrition_tracking_mode(v_client,'calorie_tracking');
    raise exception 'QA_EXPECTED_FINISHED_COACH_MODE_REJECTION_MISSING';
  exception when others then
    if sqlerrm='QA_EXPECTED_FINISHED_COACH_MODE_REJECTION_MISSING' then raise; end if;
  end;

  select count(*) into v_count_after
  from public.get_trainer_client_nutrition_plans(v_client);
  if v_count_after<>v_count_before then
    raise exception 'Historical coach read semantics changed unexpectedly';
  end if;
end $$;

rollback;
