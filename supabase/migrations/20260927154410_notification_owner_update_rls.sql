grant select on public.notification_deliveries to authenticated;
grant update(read_at,dismissed_at,updated_at) on public.notification_deliveries to authenticated;

drop policy if exists notification_deliveries_owner_update on public.notification_deliveries;
create policy notification_deliveries_owner_update on public.notification_deliveries
for update to authenticated
using (recipient_id=(select auth.uid()))
with check (recipient_id=(select auth.uid()));

create or replace function public.mark_notification_read(p_id uuid)
returns void
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
begin
  update public.notification_deliveries
  set read_at=coalesce(read_at,now()),updated_at=now()
  where id=p_id and recipient_id=(select auth.uid());
  if not found then raise exception 'Notification not found'; end if;
end;
$$;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare v_count integer;
begin
  update public.notification_deliveries
  set read_at=coalesce(read_at,now()),updated_at=now()
  where recipient_id=(select auth.uid()) and read_at is null and dismissed_at is null;
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;

create or replace function public.dismiss_notification(p_id uuid)
returns void
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
begin
  update public.notification_deliveries
  set dismissed_at=now(),read_at=coalesce(read_at,now()),updated_at=now()
  where id=p_id and recipient_id=(select auth.uid());
  if not found then raise exception 'Notification not found'; end if;
end;
$$;
