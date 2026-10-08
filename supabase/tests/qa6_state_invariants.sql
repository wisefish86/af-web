-- QA-6 production state invariants. Read-only.

do $$
declare
  v_count bigint;
begin
  select count(*) into v_count
  from (
    select client_id
    from public.training_programs
    where client_id is not null and status='active'
    group by client_id
    having count(*)>1
  ) x;
  if v_count<>0 then raise exception 'Clients with duplicate active training programs: %',v_count; end if;

  select count(*) into v_count
  from (
    select client_id
    from public.nutrition_plans
    where client_id is not null and status='active'
    group by client_id
    having count(*)>1
  ) x;
  if v_count<>0 then raise exception 'Clients with duplicate active nutrition plans: %',v_count; end if;

  select count(*) into v_count
  from (
    select client_id
    from public.workout_sessions
    where status='in_progress'
    group by client_id
    having count(*)>1
  ) x;
  if v_count<>0 then raise exception 'Clients with duplicate in-progress workouts: %',v_count; end if;

  select count(*) into v_count
  from (
    select client_id,reminder_type
    from public.reminder_rules
    group by client_id,reminder_type
    having count(*)>1
  ) x;
  if v_count<>0 then raise exception 'Duplicate reminder rules by client/type: %',v_count; end if;

  select count(*) into v_count
  from (
    select reminder_rule_id,recipient_id,channel,occurrence_date
    from public.notification_deliveries
    where reminder_rule_id is not null and occurrence_date is not null
    group by reminder_rule_id,recipient_id,channel,occurrence_date
    having count(*)>1
  ) x;
  if v_count<>0 then raise exception 'Duplicate reminder delivery occurrences: %',v_count; end if;

  select count(*) into v_count
  from public.workout_sessions
  where status='completed' and completed_at is null;
  if v_count<>0 then raise exception 'Completed workouts without completed_at: %',v_count; end if;

  select count(*) into v_count
  from public.workout_sessions
  where status='in_progress' and completed_at is not null;
  if v_count<>0 then raise exception 'In-progress workouts still have completed_at: %',v_count; end if;
end $$;
