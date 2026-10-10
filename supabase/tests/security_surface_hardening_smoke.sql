-- Read-only smoke for the security-surface hardening migration.

do $$
declare
  v_duplicate_count integer;
begin
  if has_function_privilege('authenticated','public.add_workout_comment(uuid,text)','EXECUTE') then
    raise exception 'Legacy add_workout_comment is still executable by authenticated';
  end if;
  if has_function_privilege('authenticated','public.reply_to_feedback(uuid,text)','EXECUTE') then
    raise exception 'Legacy reply_to_feedback is still executable by authenticated';
  end if;

  select count(*) into v_duplicate_count
  from pg_indexes
  where schemaname='public'
    and indexname in ('workout_sessions_one_active_per_client_uq','workout_sessions_one_in_progress_per_client');

  if v_duplicate_count<>1 then
    raise exception 'Expected exactly one active-workout uniqueness index, found %',v_duplicate_count;
  end if;
end $$;
