-- QA-3 mutation hardening:
-- 1) preserve Telegram channels in trainer workspace reminders;
-- 2) save trainer contacts atomically;
-- 3) serialize training-program family version allocation.

create unique index if not exists training_programs_family_version_uq
  on public.training_programs(family_id,version)
  where family_id is not null;

create or replace function public.assign_training_program_copy(p_source_program_id uuid,p_client_id uuid)
returns uuid
language plpgsql
set search_path to 'public','pg_temp'
as $function$
declare
  v_user uuid:=auth.uid();
  v_source public.training_programs%rowtype;
  v_new uuid;
  v_old_day record;
  v_day uuid;
  v_family uuid;
  v_version int;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not exists(
    select 1 from public.coach_clients
    where coach_id=v_user and client_id=p_client_id and status='active'
  ) then raise exception 'Client is not assigned to this trainer'; end if;

  select * into v_source
  from public.training_programs
  where id=p_source_program_id and created_by=v_user;
  if not found then raise exception 'Program not found or access denied'; end if;

  v_family:=case when v_source.client_id=p_client_id then v_source.family_id else gen_random_uuid() end;

  perform pg_advisory_xact_lock(hashtext('training-family:'||v_family::text));
  select coalesce(max(version),0)+1 into v_version
  from public.training_programs
  where family_id=v_family;

  insert into public.training_programs(
    family_id,supersedes_program_id,client_id,name,description,is_active,created_by,is_template,
    version,status,weekly_frequency,updated_at
  )
  values(
    v_family,
    case when v_source.client_id=p_client_id then v_source.id else null end,
    p_client_id,v_source.name,v_source.description,false,v_user,false,
    v_version,'draft',v_source.weekly_frequency,now()
  )
  returning id into v_new;

  for v_old_day in
    select * from public.training_days where program_id=v_source.id order by day_index
  loop
    insert into public.training_days(program_id,day_index,name,notes,session_type,planned_duration_minutes)
    values(v_new,v_old_day.day_index,v_old_day.name,v_old_day.notes,v_old_day.session_type,v_old_day.planned_duration_minutes)
    returning id into v_day;

    insert into public.program_exercises(
      training_day_id,substitution_group_id,default_exercise_id,sort_order,sets_min,sets_max,reps_min,reps_max,
      rir_min,rir_max,notes,exercise_role,progression_notes,rest_seconds,rir_enabled,allow_client_substitution,
      substitution_policy,warmup_enabled,warmup_load_percent_min,warmup_load_percent_max,warmup_reps_min,
      warmup_reps_max,warmup_notes,warmup_rest_seconds,superset_group,superset_position
    )
    select
      v_day,substitution_group_id,default_exercise_id,sort_order,sets_min,sets_max,reps_min,reps_max,
      rir_min,rir_max,notes,exercise_role,progression_notes,rest_seconds,rir_enabled,allow_client_substitution,
      substitution_policy,warmup_enabled,warmup_load_percent_min,warmup_load_percent_max,warmup_reps_min,
      warmup_reps_max,warmup_notes,warmup_rest_seconds,superset_group,superset_position
    from public.program_exercises
    where training_day_id=v_old_day.id
    order by sort_order;

    insert into public.program_cardio_blocks(
      training_day_id,modality_code,name,sort_order,duration_minutes,target_hr_min,target_hr_max,
      target_rpe_min,target_rpe_max,speed_kmh,incline_percent,distance_km,notes
    )
    select
      v_day,modality_code,name,sort_order,duration_minutes,target_hr_min,target_hr_max,
      target_rpe_min,target_rpe_max,speed_kmh,incline_percent,distance_km,notes
    from public.program_cardio_blocks
    where training_day_id=v_old_day.id
    order by sort_order;
  end loop;

  perform public.activate_training_program(v_new);
  return v_new;
end;
$function$;

create or replace function public.save_my_trainer_contact_settings(p_channels jsonb)
returns void
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_user uuid:=auth.uid();
  v_key text;
  v_value text;
  v_label text;
  v_sort integer;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.profiles where id=v_user and role='trainer') then
    raise exception 'Trainer role required';
  end if;

  for v_key,v_value in
    select key,btrim(value#>>'{}')
    from jsonb_each(coalesce(p_channels,'{}'::jsonb))
  loop
    if v_key not in ('telegram','whatsapp','max','phone','instagram','website') then
      raise exception 'Unknown contact channel: %',v_key;
    end if;
    if v_value<>'' and v_key='phone' and v_value !~ '^tel:\+[0-9]{7,15}$' then
      raise exception 'Invalid phone';
    end if;
    if v_value<>'' and v_key<>'phone' and v_value !~* '^https://' then
      raise exception 'Contact URL must start with https://';
    end if;
  end loop;

  delete from public.trainer_contact_channels where trainer_id=v_user;

  for v_key,v_value in
    select key,btrim(value#>>'{}')
    from jsonb_each(coalesce(p_channels,'{}'::jsonb))
  loop
    if v_value='' then continue; end if;

    v_label:=case v_key
      when 'telegram' then 'Telegram'
      when 'whatsapp' then 'WhatsApp'
      when 'max' then 'MAX'
      when 'phone' then 'Телефон'
      when 'instagram' then 'Instagram'
      when 'website' then 'Сайт'
    end;
    v_sort:=case v_key
      when 'telegram' then 10
      when 'whatsapp' then 20
      when 'max' then 30
      when 'phone' then 40
      when 'instagram' then 50
      when 'website' then 60
    end;

    insert into public.trainer_contact_channels(
      trainer_id,channel,url,label,enabled,sort_order,updated_at
    )
    values(v_user,v_key,v_value,v_label,true,v_sort,now());
  end loop;
end;
$function$;

revoke all on function public.save_my_trainer_contact_settings(jsonb) from public,anon;
grant execute on function public.save_my_trainer_contact_settings(jsonb) to authenticated;

create or replace function public.save_client_workspace(
  p_client_id uuid,
  p_modules jsonb,
  p_tracking jsonb,
  p_rules jsonb
)
returns jsonb
language plpgsql
set search_path to 'public','pg_temp'
as $function$
declare
  v_user uuid:=auth.uid();
  v_key text;
  v_value jsonb;
  v_rule jsonb;
  v_rule_id uuid;
  v_weekdays integer[];
  v_rule_type text;
  v_channels text[];
  v_result jsonb;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not exists(
    select 1 from public.coach_clients cc
    where cc.coach_id=v_user and cc.client_id=p_client_id and cc.status='active'
  ) then raise exception 'Client is not assigned to this trainer'; end if;

  for v_key,v_value in select key,value from jsonb_each(coalesce(p_modules,'{}'::jsonb))
  loop
    if v_key not in ('nutrition','training','progress','checkins','notifications') then
      raise exception 'Unknown module: %',v_key;
    end if;

    insert into public.client_modules(client_id,module_code,enabled,assigned_by,updated_at)
    values(p_client_id,v_key,(v_value#>>'{}')::boolean,v_user,now())
    on conflict(client_id,module_code) do update
    set enabled=excluded.enabled,
        assigned_by=excluded.assigned_by,
        ends_at=null,
        updated_at=now();
  end loop;

  for v_key,v_value in select key,value from jsonb_each(coalesce(p_tracking,'{}'::jsonb))
  loop
    if not exists(select 1 from public.tracking_fields tf where tf.code=v_key) then
      raise exception 'Unknown tracking field: %',v_key;
    end if;

    insert into public.client_tracking_config(
      client_id,field_code,enabled,required,configured_by,updated_at
    )
    values(
      p_client_id,v_key,
      coalesce((v_value->>'enabled')::boolean,false),
      case when coalesce((v_value->>'enabled')::boolean,false)
        then coalesce((v_value->>'required')::boolean,false)
        else false
      end,
      v_user,now()
    )
    on conflict(client_id,field_code) do update
    set enabled=excluded.enabled,
        required=excluded.required,
        configured_by=excluded.configured_by,
        updated_at=now();
  end loop;

  for v_rule in select value from jsonb_array_elements(coalesce(p_rules,'[]'::jsonb))
  loop
    v_rule_type:=v_rule->>'reminder_type';
    if v_rule_type not in ('weight','waist','nutrition','daily_checkin','monthly_measurements','progress_photo','monthly_checkin','workout') then
      raise exception 'Unknown reminder type: %',v_rule_type;
    end if;

    select coalesce(array_agg(value::integer order by ordinality),'{}'::integer[])
      into v_weekdays
    from jsonb_array_elements_text(coalesce(v_rule->'weekdays','[]'::jsonb)) with ordinality;

    if coalesce((v_rule->>'enabled')::boolean,false) and coalesce(array_length(v_weekdays,1),0)=0 then
      raise exception 'Enabled reminder must have at least one weekday';
    end if;

    select coalesce(array_agg(distinct value),'{}'::text[])
      into v_channels
    from jsonb_array_elements_text(coalesce(v_rule->'channels','["in_app","telegram"]'::jsonb));

    if coalesce(array_length(v_channels,1),0)=0 then
      v_channels:=array['in_app','telegram']::text[];
    end if;
    if exists(select 1 from unnest(v_channels) channel where channel not in ('in_app','telegram')) then
      raise exception 'Unsupported reminder channel';
    end if;

    if coalesce(v_rule->>'id','') like 'draft:%' then
      if exists(
        select 1 from public.reminder_rules rr
        where rr.client_id=p_client_id and rr.reminder_type=v_rule_type
      ) then
        raise exception 'Reminder type already exists: %',v_rule_type;
      end if;

      insert into public.reminder_rules(
        client_id,module_code,reminder_type,channel,local_time,weekdays,timezone,enabled,settings,
        created_by,name,channels,recipient_mode,skip_if_completed,title_template,body_template,
        action_path,last_processed_local_date,updated_at
      )
      values(
        p_client_id,nullif(v_rule->>'module_code',''),v_rule_type,coalesce(v_channels[1],'in_app'),
        (v_rule->>'local_time')::time,v_weekdays,coalesce(nullif(v_rule->>'timezone',''),'Europe/Moscow'),
        coalesce((v_rule->>'enabled')::boolean,true),coalesce(v_rule->'settings','{}'::jsonb),
        v_user,nullif(v_rule->>'name',''),v_channels,
        coalesce(nullif(v_rule->>'recipient_mode',''),'client'),
        coalesce((v_rule->>'skip_if_completed')::boolean,true),
        nullif(v_rule->>'title_template',''),nullif(v_rule->>'body_template',''),
        nullif(v_rule->>'action_path',''),null,now()
      );
    else
      begin
        v_rule_id:=(v_rule->>'id')::uuid;
      exception when invalid_text_representation then
        raise exception 'Invalid reminder id';
      end;

      update public.reminder_rules
      set module_code=nullif(v_rule->>'module_code',''),
          reminder_type=v_rule_type,
          channel=coalesce(v_channels[1],'in_app'),
          local_time=(v_rule->>'local_time')::time,
          weekdays=v_weekdays,
          timezone=coalesce(nullif(v_rule->>'timezone',''),'Europe/Moscow'),
          enabled=coalesce((v_rule->>'enabled')::boolean,true),
          settings=coalesce(v_rule->'settings','{}'::jsonb),
          name=nullif(v_rule->>'name',''),
          channels=v_channels,
          recipient_mode=coalesce(nullif(v_rule->>'recipient_mode',''),'client'),
          skip_if_completed=coalesce((v_rule->>'skip_if_completed')::boolean,true),
          title_template=nullif(v_rule->>'title_template',''),
          body_template=nullif(v_rule->>'body_template',''),
          action_path=nullif(v_rule->>'action_path',''),
          last_processed_local_date=null,
          updated_at=now()
      where id=v_rule_id and client_id=p_client_id;

      if not found then raise exception 'Reminder rule not found'; end if;
    end if;
  end loop;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at),'[]'::jsonb)
  into v_result
  from (
    select id,client_id,module_code,reminder_type,name,local_time,weekdays,timezone,enabled,
           channels,recipient_mode,skip_if_completed,title_template,body_template,action_path,
           settings,created_by,created_at
    from public.reminder_rules
    where client_id=p_client_id
  ) x;

  return v_result;
end;
$function$;
