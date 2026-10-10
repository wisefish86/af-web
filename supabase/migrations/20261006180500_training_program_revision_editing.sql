-- Trainer editing of an active training program must create a new immutable version
-- in the same family. Re-saving a draft must preserve its version lineage.

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
  v_old public.training_programs%rowtype;
  v_new_program_id uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select * into v_old
  from public.training_programs
  where id=p_old_program_id and created_by=v_user and status='draft'
  for update;

  if not found then raise exception 'Draft program not found or is already published'; end if;

  v_new_program_id:=public.create_training_program_with_warmups(p_program,p_warmups);

  delete from public.program_exercises pe
  using public.training_days td
  where pe.training_day_id=td.id and td.program_id=p_old_program_id;

  delete from public.program_cardio_blocks pcb
  using public.training_days td
  where pcb.training_day_id=td.id and td.program_id=p_old_program_id;

  delete from public.training_days
  where program_id=p_old_program_id;

  delete from public.training_programs
  where id=p_old_program_id and created_by=v_user and status='draft';

  if not found then raise exception 'Previous draft could not be replaced'; end if;

  update public.training_programs
  set family_id=v_old.family_id,
      version=v_old.version,
      supersedes_program_id=v_old.supersedes_program_id,
      source_template_id=v_old.source_template_id,
      updated_at=now()
  where id=v_new_program_id and created_by=v_user and status='draft';

  if not found then raise exception 'Replacement draft could not inherit version lineage'; end if;

  return v_new_program_id;
end;
$function$;

create or replace function public.create_training_program_revision(
  p_source_program_id uuid,
  p_program jsonb,
  p_warmups jsonb
)
returns uuid
language plpgsql
set search_path to 'public','pg_temp'
as $function$
declare
  v_user uuid:=auth.uid();
  v_source public.training_programs%rowtype;
  v_new uuid;
  v_version integer;
  v_payload_client uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select * into v_source
  from public.training_programs
  where id=p_source_program_id
    and created_by=v_user
    and status='active'
  for update;

  if not found then raise exception 'Active program not found or access denied'; end if;

  v_payload_client:=nullif(p_program->>'client_id','')::uuid;
  if v_payload_client is distinct from v_source.client_id then
    raise exception 'A program revision must stay assigned to the same client';
  end if;

  perform pg_advisory_xact_lock(hashtext('training-family:'||v_source.family_id::text));

  select coalesce(max(version),0)+1 into v_version
  from public.training_programs
  where family_id=v_source.family_id;

  v_new:=public.create_training_program_with_warmups(p_program,p_warmups);

  update public.training_programs
  set family_id=v_source.family_id,
      version=v_version,
      supersedes_program_id=v_source.id,
      source_template_id=v_source.source_template_id,
      is_template=false,
      updated_at=now()
  where id=v_new and created_by=v_user and status='draft';

  if not found then raise exception 'Program revision could not be created'; end if;

  return v_new;
end;
$function$;

grant execute on function public.create_training_program_revision(uuid,jsonb,jsonb) to authenticated;
