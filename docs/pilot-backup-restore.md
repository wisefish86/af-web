# Backup and restore before the pilot

## Protection layers

1. Keep Supabase automatic backups enabled and record the current retention window before onboarding pilot clients.
2. Enable Point-in-Time Recovery when the project plan supports it. Set an operational recovery objective of 24 hours without PITR and 15 minutes with PITR.
3. Before every production migration, export schema plus `public` data and store the encrypted dump outside the project.
4. Never test restore against production. Restore to a separate Supabase project, run the integrity queries below, then document the recovery time.

## Required restore drill

- Restore the latest backup into an isolated project.
- Compare row counts for `profiles`, `coach_clients`, `training_programs`, `workout_sessions`, `workout_exercises`, and `workout_sets`.
- Confirm that every workout child has a parent, every completed workout has snapshot names, and the existing coach-client link is present.
- Sign in with test trainer and client accounts and run the pilot E2E scenario.
- Record backup timestamp, restore start/end, row-count differences, and tester name.

## Integrity queries

```sql
select status,count(*) from public.workout_sessions group by status;
select count(*) from public.workout_exercises we left join public.workout_sessions ws on ws.id=we.workout_session_id where ws.id is null;
select count(*) from public.workout_sets s left join public.workout_exercises we on we.id=s.workout_exercise_id where we.id is null;
select count(*) from public.workout_sessions where status='completed' and (program_name_snapshot is null or training_day_name_snapshot is null);
```

Restoring production is a separate incident action: freeze writes, identify the recovery point, obtain owner approval, restore, run integrity checks, then reopen access.

