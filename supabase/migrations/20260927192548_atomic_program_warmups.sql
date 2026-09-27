create or replace function public.create_training_program_with_warmups(p_program jsonb,p_warmups jsonb)
returns uuid
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_program_id uuid;
begin
  v_program_id:=public.create_training_program(p_program);
  perform public.configure_program_warmups(v_program_id,p_warmups);
  return v_program_id;
end;
$$;

revoke all on function public.create_training_program_with_warmups(jsonb,jsonb) from public,anon;
grant execute on function public.create_training_program_with_warmups(jsonb,jsonb) to authenticated;

create or replace function public.clone_training_program_with_warmups(p_program_id uuid)
returns uuid
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_new_program uuid;
begin
  v_new_program:=public.clone_training_program(p_program_id);

  update public.program_exercises new_pe
  set warmup_enabled=old_pe.warmup_enabled,
      warmup_load_percent_min=old_pe.warmup_load_percent_min,
      warmup_load_percent_max=old_pe.warmup_load_percent_max,
      warmup_reps_min=old_pe.warmup_reps_min,
      warmup_reps_max=old_pe.warmup_reps_max,
      warmup_notes=old_pe.warmup_notes
  from public.training_days new_td
  join public.training_days old_td
    on old_td.day_index=new_td.day_index
   and old_td.program_id=p_program_id
  join public.program_exercises old_pe
    on old_pe.training_day_id=old_td.id
  where new_td.program_id=v_new_program
    and new_pe.training_day_id=new_td.id
    and new_pe.sort_order=old_pe.sort_order;

  return v_new_program;
end;
$$;

revoke all on function public.clone_training_program_with_warmups(uuid) from public,anon;
grant execute on function public.clone_training_program_with_warmups(uuid) to authenticated;
