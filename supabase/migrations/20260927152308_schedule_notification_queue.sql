create extension if not exists pg_cron with schema extensions;

create or replace function public.mark_notification_read(p_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update public.notification_deliveries
  set read_at=coalesce(read_at,now()),updated_at=now()
  where id=p_id and recipient_id=(select auth.uid());
  if not found then raise exception 'Notification not found'; end if;
end; $$;

create or replace function public.mark_all_notifications_read()
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_count integer;
begin
  update public.notification_deliveries set read_at=coalesce(read_at,now()),updated_at=now()
  where recipient_id=(select auth.uid()) and read_at is null and dismissed_at is null;
  get diagnostics v_count=row_count;
  return v_count;
end; $$;

create or replace function public.dismiss_notification(p_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update public.notification_deliveries
  set dismissed_at=now(),read_at=coalesce(read_at,now()),updated_at=now()
  where id=p_id and recipient_id=(select auth.uid());
  if not found then raise exception 'Notification not found'; end if;
end; $$;

do $$
declare v_job bigint;
begin
  select jobid into v_job from cron.job where jobname='andrey-fit-enqueue-reminders';
  if v_job is not null then perform cron.unschedule(v_job); end if;
  perform cron.schedule('andrey-fit-enqueue-reminders','*/5 * * * *','select public.enqueue_due_reminders(now());');
end $$;
