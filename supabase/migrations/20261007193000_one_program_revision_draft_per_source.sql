-- Prevent two browser tabs / repeated ambiguous requests from creating
-- multiple draft revisions of the same active training program.

create unique index if not exists training_programs_one_draft_revision_per_source_uq
  on public.training_programs(created_by,supersedes_program_id)
  where status='draft' and supersedes_program_id is not null;

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

  if exists(
    select 1
    from public.training_programs p
    where p.created_by=v_user
      and p.supersedes_program_id=v_source.id
      and p.status='draft'
  ) then
    raise exception 'Draft revision already exists for this program';
  end if;

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

revoke all on function public.create_training_program_revision(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.create_training_program_revision(uuid,jsonb,jsonb) to authenticated;
