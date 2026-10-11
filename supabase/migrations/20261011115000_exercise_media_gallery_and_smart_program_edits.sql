-- Exercise media gallery + pragmatic training program versioning.
-- Multiple media rows per exercise/kind are allowed; the first image by sort_order is the cover.

drop index if exists public.exercise_media_owned_slot_uq;

create or replace function public.set_my_exercise_media_cover(
  p_exercise_id uuid,
  p_media_id uuid
)
returns uuid
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  if not exists(
    select 1
    from public.exercise_media em
    where em.id=p_media_id
      and em.exercise_id=p_exercise_id
      and em.kind='image'
      and em.created_by=v_user
  ) then
    raise exception 'Image not found or access denied';
  end if;

  update public.exercise_media
  set sort_order = case
    when public.exercise_media.id=p_media_id then 0
    else 100 + ranked.row_number_value * 10
  end
  from (
    select em.id, row_number() over(order by em.sort_order, em.created_at, em.id) as row_number_value
    from public.exercise_media em
    where em.exercise_id=p_exercise_id
      and em.kind='image'
      and em.created_by=v_user
  ) ranked
  where public.exercise_media.id=ranked.id;

  return p_media_id;
end;
$$;

revoke all on function public.set_my_exercise_media_cover(uuid,uuid) from public, anon;
grant execute on function public.set_my_exercise_media_cover(uuid,uuid) to authenticated;

create or replace function public.training_program_composition_signature(p_program_id uuid)
returns text
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select md5(coalesce(string_agg(day_signature, '||' order by day_index), ''))
  from (
    select
      td.day_index,
      (
        'E:' || coalesce((
          select string_agg(pe.default_exercise_id::text, ',' order by pe.default_exercise_id::text)
          from public.program_exercises pe
          where pe.training_day_id = td.id
        ), '') ||
        '|C:' || coalesce((
          select string_agg(pcb.modality_code, ',' order by pcb.modality_code)
          from public.program_cardio_blocks pcb
          where pcb.training_day_id = td.id
        ), '')
      ) as day_signature
    from public.training_days td
    where td.program_id = p_program_id
  ) s;
$$;

create or replace function public.save_training_program_active_edit_v1(
  p_request_id uuid,
  p_source_program_id uuid,
  p_program jsonb,
  p_warmups jsonb
)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_user uuid := auth.uid();
  v_source public.training_programs%rowtype;
  v_existing public.training_programs%rowtype;
  v_fingerprint text;
  v_workout_count integer;
  v_before_signature text;
  v_temp_id uuid;
  v_temp public.training_programs%rowtype;
  v_after_signature text;
  v_version integer;
  v_result_id uuid;
  v_mode text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_request_id is null then raise exception 'Request id is required'; end if;
  if p_source_program_id is null then raise exception 'Source program is required'; end if;

  v_fingerprint := md5(
    p_source_program_id::text || '|' ||
    coalesce(p_program,'{}'::jsonb)::text || '|' ||
    coalesce(p_warmups,'[]'::jsonb)::text
  );

  perform pg_advisory_xact_lock(hashtext('training-active-edit:'||v_user::text||':'||p_source_program_id::text));
  perform pg_advisory_xact_lock(hashtext('training-save:'||v_user::text||':'||p_request_id::text));

  select * into v_existing
  from public.training_programs tp
  where tp.created_by = v_user and tp.save_request_id = p_request_id;

  if found then
    if v_existing.save_request_fingerprint is distinct from v_fingerprint then
      raise exception 'Request id was already used for a different program payload';
    end if;
    return jsonb_build_object(
      'program_id', v_existing.id,
      'mode', case when v_existing.status='active' then 'updated_active' else 'revision_created' end,
      'version', v_existing.version,
      'status', v_existing.status
    );
  end if;

  select * into v_source
  from public.training_programs
  where id = p_source_program_id
    and created_by = v_user
    and status = 'active'
  for update;

  if not found then raise exception 'Active program not found or access denied'; end if;

  if nullif(p_program->>'client_id','')::uuid is distinct from v_source.client_id then
    raise exception 'A program edit must stay assigned to the same client';
  end if;

  select count(*)::integer into v_workout_count
  from public.workout_sessions ws
  where ws.program_id = p_source_program_id;

  v_before_signature := public.training_program_composition_signature(p_source_program_id);

  -- Build the candidate once. It is either transplanted into the current active
  -- row or converted into the next draft revision.
  v_temp_id := public.create_training_program_with_warmups(
    coalesce(p_program,'{}'::jsonb),
    coalesce(p_warmups,'[]'::jsonb)
  );

  select * into v_temp
  from public.training_programs
  where id = v_temp_id and created_by = v_user and status = 'draft'
  for update;

  if not found then raise exception 'Program candidate could not be created'; end if;

  v_after_signature := public.training_program_composition_signature(v_temp_id);

  if v_workout_count = 0 or v_before_signature = v_after_signature then
    delete from public.training_days where program_id = p_source_program_id;

    update public.training_days
    set program_id = p_source_program_id
    where program_id = v_temp_id;

    update public.training_programs
    set name = v_temp.name,
        description = v_temp.description,
        weekly_frequency = v_temp.weekly_frequency,
        is_template = false,
        updated_at = now(),
        save_request_id = p_request_id,
        save_request_fingerprint = v_fingerprint
    where id = p_source_program_id and created_by = v_user and status = 'active';

    delete from public.training_programs
    where id = v_temp_id and created_by = v_user and status = 'draft';

    v_result_id := p_source_program_id;
    v_mode := 'updated_active';
  else
    perform pg_advisory_xact_lock(hashtext('training-family:'||v_source.family_id::text));

    if exists(
      select 1 from public.training_programs p
      where p.created_by = v_user
        and p.supersedes_program_id = v_source.id
        and p.status = 'draft'
        and p.id <> v_temp_id
    ) then
      delete from public.training_programs where id = v_temp_id and created_by = v_user and status='draft';
      raise exception 'Draft revision already exists for this program';
    end if;

    select coalesce(max(version),0)+1 into v_version
    from public.training_programs
    where family_id = v_source.family_id;

    update public.training_programs
    set family_id = v_source.family_id,
        version = v_version,
        supersedes_program_id = v_source.id,
        source_template_id = v_source.source_template_id,
        is_template = false,
        updated_at = now(),
        save_request_id = p_request_id,
        save_request_fingerprint = v_fingerprint
    where id = v_temp_id and created_by = v_user and status = 'draft';

    v_result_id := v_temp_id;
    v_mode := 'revision_created';
  end if;

  return jsonb_build_object(
    'program_id', v_result_id,
    'mode', v_mode,
    'version', case when v_mode='updated_active' then v_source.version else v_version end,
    'status', case when v_mode='updated_active' then 'active' else 'draft' end
  );
end;
$$;

revoke all on function public.training_program_composition_signature(uuid) from public, anon;
grant execute on function public.training_program_composition_signature(uuid) to authenticated;

revoke all on function public.save_training_program_active_edit_v1(uuid,uuid,jsonb,jsonb) from public, anon;
grant execute on function public.save_training_program_active_edit_v1(uuid,uuid,jsonb,jsonb) to authenticated;
