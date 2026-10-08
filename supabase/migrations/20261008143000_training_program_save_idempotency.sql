-- Retry-safe trainer program draft saves.
-- Exact request identity replaces client-side "similar recent draft" recovery.

alter table public.training_programs
  add column if not exists save_request_id uuid,
  add column if not exists save_request_fingerprint text;

alter table public.training_programs
  drop constraint if exists training_programs_save_request_pair_check;
alter table public.training_programs
  add constraint training_programs_save_request_pair_check
  check ((save_request_id is null) = (save_request_fingerprint is null));

create unique index if not exists training_programs_save_request_uq
  on public.training_programs(created_by,save_request_id)
  where save_request_id is not null;

create or replace function public.save_training_program_draft_v2(
  p_request_id uuid,
  p_old_program_id uuid,
  p_source_program_id uuid,
  p_program jsonb,
  p_warmups jsonb
)
returns uuid
language plpgsql
security invoker
set search_path to 'public','pg_temp'
as $function$
declare
  v_user uuid:=auth.uid();
  v_existing uuid;
  v_existing_fingerprint text;
  v_created uuid;
  v_fingerprint text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_request_id is null then raise exception 'Request id is required'; end if;
  if p_old_program_id is not null and p_source_program_id is not null then
    raise exception 'Draft replacement and active-program revision are mutually exclusive';
  end if;

  v_fingerprint:=md5(
    coalesce(p_old_program_id::text,'')||'|'||
    coalesce(p_source_program_id::text,'')||'|'||
    coalesce(p_program,'{}'::jsonb)::text||'|'||
    coalesce(p_warmups,'[]'::jsonb)::text
  );

  perform pg_advisory_xact_lock(hashtext('training-save:'||v_user::text||':'||p_request_id::text));

  select tp.id,tp.save_request_fingerprint
    into v_existing,v_existing_fingerprint
  from public.training_programs tp
  where tp.created_by=v_user
    and tp.save_request_id=p_request_id;

  if v_existing is not null then
    if v_existing_fingerprint is distinct from v_fingerprint then
      raise exception 'Request id was already used for a different program payload';
    end if;
    return v_existing;
  end if;

  if p_old_program_id is not null then
    v_created:=public.replace_training_program_draft(
      p_old_program_id,coalesce(p_program,'{}'::jsonb),coalesce(p_warmups,'[]'::jsonb)
    );
  elsif p_source_program_id is not null then
    v_created:=public.create_training_program_revision(
      p_source_program_id,coalesce(p_program,'{}'::jsonb),coalesce(p_warmups,'[]'::jsonb)
    );
  else
    v_created:=public.create_training_program_with_warmups(
      coalesce(p_program,'{}'::jsonb),coalesce(p_warmups,'[]'::jsonb)
    );
  end if;

  update public.training_programs
  set save_request_id=p_request_id,
      save_request_fingerprint=v_fingerprint
  where id=v_created and created_by=v_user and status='draft';

  if not found then raise exception 'Saved draft could not be tagged with request identity'; end if;
  return v_created;
end;
$function$;

revoke all on function public.save_training_program_draft_v2(uuid,uuid,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.save_training_program_draft_v2(uuid,uuid,uuid,jsonb,jsonb) to authenticated;
