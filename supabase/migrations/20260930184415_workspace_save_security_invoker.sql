create or replace function public.save_client_workspace(
  p_client_id uuid,
  p_modules jsonb,
  p_tracking jsonb,
  p_rules jsonb
)
returns jsonb
language plpgsql
security invoker
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
        p_client_id,nullif(v_rule->>'module_code',''),v_rule_type,'in_app',
        (v_rule->>'local_time')::time,v_weekdays,coalesce(nullif(v_rule->>'timezone',''),'Europe/Moscow'),
        coalesce((v_rule->>'enabled')::boolean,true),coalesce(v_rule->'settings','{}'::jsonb),
        v_user,nullif(v_rule->>'name',''),array['in_app']::text[],
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
          channel='in_app',
          local_time=(v_rule->>'local_time')::time,
          weekdays=v_weekdays,
          timezone=coalesce(nullif(v_rule->>'timezone',''),'Europe/Moscow'),
          enabled=coalesce((v_rule->>'enabled')::boolean,true),
          settings=coalesce(v_rule->'settings','{}'::jsonb),
          name=nullif(v_rule->>'name',''),
          channels=array['in_app']::text[],
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

revoke execute on function public.save_client_workspace(uuid,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.save_client_workspace(uuid,jsonb,jsonb,jsonb) to authenticated;
