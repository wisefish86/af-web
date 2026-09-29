create or replace function public.save_my_nutrition_setup_v2(
  p_sex text,
  p_height numeric,
  p_steps integer,
  p_daily_activity text,
  p_strength_sessions integer,
  p_strength_minutes integer,
  p_cardio_sessions integer,
  p_cardio_minutes integer,
  p_cardio_intensity text,
  p_goal text
)
returns table(
  bmr_kcal integer,
  maintenance_kcal integer,
  target_kcal integer,
  activity_factor numeric,
  exercise_kcal_day integer,
  estimated_weekly_change_kg numeric,
  weight_kg_used numeric,
  age_used integer
)
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_user uuid := auth.uid();
  v_age integer;
  v_weight numeric;
  v_bmr numeric;
  v_pal numeric;
  v_step_adjust numeric;
  v_strength_week numeric;
  v_cardio_met numeric;
  v_cardio_week numeric;
  v_exercise_day integer;
  v_maint integer;
  v_target integer;
  v_goal_ratio numeric;
  v_weekly_change numeric;
begin
  if v_user is null then raise exception 'Нужно войти в аккаунт'; end if;

  select age into v_age
  from public.profiles
  where id=v_user;

  select weight_kg into v_weight
  from public.measurements
  where client_id=v_user and weight_kg is not null
  order by measured_at desc, id desc
  limit 1;

  if v_age is null then raise exception 'Сначала укажи возраст в профиле'; end if;
  if v_age < 18 then raise exception 'Этот калькулятор рассчитан на взрослых от 18 лет'; end if;
  if v_weight is null then raise exception 'Сначала внеси актуальный вес в разделе «Прогресс»'; end if;
  if p_sex not in ('male','female') then raise exception 'Укажи пол для расчёта'; end if;
  if p_height is null or p_height<100 or p_height>250 then raise exception 'Укажи рост от 100 до 250 см'; end if;
  if p_steps is null or p_steps<0 or p_steps>100000 then raise exception 'Проверь среднее число шагов'; end if;
  if p_daily_activity not in ('sedentary','mixed','on_feet','physical') then raise exception 'Укажи повседневную активность'; end if;
  if coalesce(p_strength_sessions,0) not between 0 and 14 then raise exception 'Проверь число силовых тренировок'; end if;
  if coalesce(p_strength_minutes,60) not between 15 and 240 then raise exception 'Проверь длительность силовой тренировки'; end if;
  if coalesce(p_cardio_sessions,0) not between 0 and 14 then raise exception 'Проверь число кардио-тренировок'; end if;
  if coalesce(p_cardio_minutes,30) not between 5 and 300 then raise exception 'Проверь длительность кардио'; end if;
  if p_cardio_intensity not in ('light','moderate','vigorous') then raise exception 'Укажи интенсивность кардио'; end if;
  if p_goal not in ('lose_slow','lose_standard','lose_fast','maintain','gain_slow','gain_fast') then raise exception 'Укажи цель'; end if;

  v_bmr := 10*v_weight + 6.25*p_height - 5*v_age
    + case when p_sex='male' then 5 else -161 end;

  v_pal := case p_daily_activity
    when 'sedentary' then 1.40
    when 'mixed' then 1.50
    when 'on_feet' then 1.60
    when 'physical' then 1.75
  end;

  v_step_adjust := case
    when p_steps < 4000 then -0.05
    when p_steps < 7000 then 0
    when p_steps < 10000 then 0.05
    when p_steps < 13000 then 0.10
    else 0.15
  end;
  v_pal := greatest(1.35,least(1.90,v_pal+v_step_adjust));

  v_strength_week :=
    coalesce(p_strength_sessions,0)
    * coalesce(p_strength_minutes,60)::numeric / 60
    * (4.0-1.0) * v_weight;

  v_cardio_met := case p_cardio_intensity
    when 'light' then 4.0
    when 'moderate' then 6.0
    when 'vigorous' then 8.0
  end;

  v_cardio_week :=
    coalesce(p_cardio_sessions,0)
    * coalesce(p_cardio_minutes,30)::numeric / 60
    * (v_cardio_met-1.0) * v_weight;

  v_exercise_day := round((v_strength_week+v_cardio_week)/7);
  v_maint := round((v_bmr*v_pal+v_exercise_day)/25)*25;

  v_goal_ratio := case p_goal
    when 'lose_slow' then 0.90
    when 'lose_standard' then 0.85
    when 'lose_fast' then 0.80
    when 'gain_slow' then 1.05
    when 'gain_fast' then 1.10
    else 1.00
  end;

  v_target := round((v_maint*v_goal_ratio)/25)*25;
  v_weekly_change := round((((v_target-v_maint)::numeric*7)/7700),2);

  insert into public.client_nutrition_setup(
    client_id,sex_for_calculation,height_cm,average_steps,training_days_per_week,goal,
    daily_activity_level,strength_sessions_per_week,strength_minutes_per_session,
    cardio_sessions_per_week,cardio_minutes_per_session,cardio_intensity,
    bmr_kcal,activity_factor,exercise_kcal_day,weight_kg_used,age_used,
    estimated_maintenance_kcal,target_kcal,estimated_weekly_change_kg,
    calculation_method,updated_at
  )
  values(
    v_user,p_sex,p_height,p_steps,
    least(14,coalesce(p_strength_sessions,0)+coalesce(p_cardio_sessions,0)),
    p_goal,p_daily_activity,coalesce(p_strength_sessions,0),coalesce(p_strength_minutes,60),
    coalesce(p_cardio_sessions,0),coalesce(p_cardio_minutes,30),p_cardio_intensity,
    round(v_bmr),v_pal,v_exercise_day,v_weight,v_age,
    v_maint,v_target,v_weekly_change,'mifflin_pal_met_v2',now()
  )
  on conflict(client_id) do update set
    sex_for_calculation=excluded.sex_for_calculation,
    height_cm=excluded.height_cm,
    average_steps=excluded.average_steps,
    training_days_per_week=excluded.training_days_per_week,
    goal=excluded.goal,
    daily_activity_level=excluded.daily_activity_level,
    strength_sessions_per_week=excluded.strength_sessions_per_week,
    strength_minutes_per_session=excluded.strength_minutes_per_session,
    cardio_sessions_per_week=excluded.cardio_sessions_per_week,
    cardio_minutes_per_session=excluded.cardio_minutes_per_session,
    cardio_intensity=excluded.cardio_intensity,
    bmr_kcal=excluded.bmr_kcal,
    activity_factor=excluded.activity_factor,
    exercise_kcal_day=excluded.exercise_kcal_day,
    weight_kg_used=excluded.weight_kg_used,
    age_used=excluded.age_used,
    estimated_maintenance_kcal=excluded.estimated_maintenance_kcal,
    target_kcal=excluded.target_kcal,
    estimated_weekly_change_kg=excluded.estimated_weekly_change_kg,
    calculation_method=excluded.calculation_method,
    updated_at=now();

  return query select
    round(v_bmr)::integer,
    v_maint,
    v_target,
    v_pal,
    v_exercise_day,
    v_weekly_change,
    v_weight,
    v_age;
end;
$$;
