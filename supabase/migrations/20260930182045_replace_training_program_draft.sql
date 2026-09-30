create or replace function public.replace_training_program_draft(
  p_old_program_id uuid,
  p_program jsonb,
  p_warmups jsonb
)
returns uuid
language plpgsql
set search_path to 'public','pg_temp'
as $function$
declare
  v_user uuid:=auth.uid();
  v_new_program_id uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  perform 1
  from public.training_programs
  where id=p_old_program_id and created_by=v_user and status='draft'
  for update;

  if not found then raise exception 'Draft program not found or is already published'; end if;

  v_new_program_id:=public.create_training_program_with_warmups(p_program,p_warmups);

  delete from public.training_programs
  where id=p_old_program_id and created_by=v_user and status='draft';

  if not found then raise exception 'Previous draft could not be replaced'; end if;

  return v_new_program_id;
end;
$function$;

revoke execute on function public.replace_training_program_draft(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.replace_training_program_draft(uuid,jsonb,jsonb) to authenticated;
