
create or replace function public.guard_published_training_program()
returns trigger
language plpgsql
set search_path to 'public','pg_temp'
as $function$
begin
  if auth.role()='service_role' then
    return case when tg_op='DELETE' then old else new end;
  end if;

  if tg_op='DELETE' then
    if old.status<>'draft' then
      raise exception 'Published or archived training programs are immutable; archive instead';
    end if;
    return old;
  end if;

  if old.status<>'draft' then
    if (to_jsonb(new)-array['status','is_active','updated_at']::text[])
       is distinct from
       (to_jsonb(old)-array['status','is_active','updated_at']::text[]) then
      raise exception 'Published or archived training program content is immutable; create a new version';
    end if;

    if old.status='archived' and new.status<>'archived' then
      raise exception 'Archived training programs cannot be reactivated; create a new version';
    end if;

    if old.status='active' and new.status not in ('active','archived') then
      raise exception 'Active training program can only remain active or be archived';
    end if;
  end if;

  return new;
end;
$function$;
