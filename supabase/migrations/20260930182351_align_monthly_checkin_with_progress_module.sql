update public.reminder_rules
set module_code='progress',updated_at=now(),last_processed_local_date=null
where reminder_type='monthly_checkin'
  and module_code is distinct from 'progress';
