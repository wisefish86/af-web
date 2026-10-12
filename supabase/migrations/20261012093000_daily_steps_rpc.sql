create or replace function public.save_my_wellbeing_checkin_v2(
  p_date date,
  p_hunger smallint default null,
  p_energy smallint default null,
  p_stress smallint default null,
  p_sleep smallint default null,
  p_ease smallint default null,
  p_steps integer default null,
  p_comment text default null
)
returns uuid
language plpgsql
set search_path to 'public','private','pg_temp'
as $function$
declare
  v_user uuid:=auth.uid();
  v_date date:=coalesce(p_date,current_date);
  v_id uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_steps is not null and (p_steps<0 or p_steps>100000) then raise exception 'Invalid steps'; end if;

  insert into public.daily_checkins(
    client_id,checkin_date,hunger,energy,stress,sleep,ease,steps,comment
  ) values(
    v_user,v_date,p_hunger,p_energy,p_stress,p_sleep,p_ease,p_steps,nullif(btrim(p_comment),'')
  )
  on conflict(client_id,checkin_date) do update
  set hunger=excluded.hunger,
      energy=excluded.energy,
      stress=excluded.stress,
      sleep=excluded.sleep,
      ease=excluded.ease,
      steps=excluded.steps,
      comment=excluded.comment
  returning id into v_id;

  perform private.sync_client_feedback_comment(
    v_user,'daily_checkin',v_date::text,'Комментарий к самочувствию',p_comment,null
  );

  return v_id;
end;
$function$;

revoke all on function public.save_my_wellbeing_checkin_v2(date,smallint,smallint,smallint,smallint,smallint,integer,text) from public,anon;
grant execute on function public.save_my_wellbeing_checkin_v2(date,smallint,smallint,smallint,smallint,smallint,integer,text) to authenticated;
