# QA-3 · Mutation inventory and failure audit

Audit scope: client/trainer feature services, direct page auth writes, Supabase RPCs, storage mutations and production DB invariants.

## Global mutation contract

Every user-visible write must satisfy:
1. **0 rows is not success** when an existing row is expected.
2. **Lost response after commit** must recover through idempotent retry or read-after-write.
3. **Real failure** keeps the user's draft editable.
4. **Post-success refresh failure** must not turn the primary action into failure.
5. **Double tap / concurrent request** must not create semantic duplicates.
6. **Multi-row logical writes** should be one DB transaction/RPC when possible.
7. **Storage + DB** must distinguish primary DB success from best-effort file cleanup.
8. Critical invariants belong in DB constraints/indexes as well as UI logic.

## Production invariants checked 06.10.2026

All currently clean:
- duplicate clients with >1 `in_progress` workout: **0**
- duplicate active training programs per client: **0**
- duplicate active nutrition plans per client: **0**
- duplicate reminder types per client: **0**
- duplicate trainer contact channels: **0**
- duplicate training-program `family_id + version`: **0**

Existing DB guards:
- unique in-progress workout per client
- unique active training program per client
- unique active nutrition plan per client
- unique reminder `client_id + reminder_type`
- unique trainer contact `trainer_id + channel`
- unique notification delivery occurrence
- unique active personal food name per client

## Findings fixed in QA-3 package

### P0 · Workspace reminders silently lost Telegram
`save_client_workspace` accepted `channels=['in_app','telegram']` from UI but overwrote it with `['in_app']`.
The reminder queue iterates `reminder_rules.channels`, so a later workspace save could silently stop Telegram reminder deliveries.

**Fix:** RPC now validates and persists the requested supported channels.

### P1 · Trainer contacts were a six-request partial write
`saveMyTrainerContactSettings` previously ran independent DELETE/UPSERT requests with `Promise.all`.
A network/server failure could leave a mixed old/new contact set.

**Fix:** one transactional `save_my_trainer_contact_settings(jsonb)` RPC validates all values first, then replaces the set atomically.

### P1 · Training program version allocation race
`assign_training_program_copy` used `max(version)+1` without a family lock, and `(family_id,version)` was not unique.

**Fix:** partial unique index on `(family_id,version)` + advisory transaction lock before version allocation.

### P1 · Monthly progress reminder SELECT→INSERT race
`ensureMyProgressCheckinReminder` could race between the existence check and insert.

**Fix:** insert path changed to `upsert(... onConflict: client_id,reminder_type)`.

## Already hardened before QA-3

- workout start/resume/complete/set/delete/substitution: server reconciliation and/or idempotent RPC
- reopened workout vs midnight cron: `reopened_at` rollover anchor
- feedback messages: stable `request_id`
- client workspace: transactional RPC + full semantic readback
- Meal Plan / nutrition drafts: version/readback reconciliation
- exercise media: owned-row reconciliation; DB success separated from storage cleanup warning
- personal foods/meals/favorites: read-after-write recovery in UI
- trainer/client lifecycle actions: reload + server truth reconciliation
- profile/body/settings: readback and explicit partial-save handling
- trainer login: auth-lock hardening + alternate Edge Function transport fallback

## Residual risks for next QA-3 passes

### P1 · Auth password mutations
`auth.updateUser({password})` is outside Postgres transactions. A lost response can be ambiguous because reading the user does not prove which password is active.
Need dedicated E2E with disposable auth test account and explicit re-login verification.

### P1 · Storage upload transport loss
A file upload can succeed while the HTTP response is lost before the DB row is written, leaving an orphan storage object.
Current design avoids corrupting the DB reference, but orphan cleanup still needs a periodic audit/cleanup strategy.

### P1 · Non-server-idempotent CREATE flows
Some create flows rely on immediate UI readback rather than request-id idempotency:
- trainer/global food creation
- personal food creation (active-name unique index mitigates exact-name duplicates)
- some draft/version creation RPCs
A browser crash between commit and readback remains a narrower duplication risk.

### P1 · Two-step cross-system / cross-RPC saves
Some flows are retry-safe but not truly atomic:
- first access: Auth password update -> profile setup RPC
- profile/base + body profile
These need E2E failure-injection coverage; they cannot always be one DB transaction.

### P2 · Generic reminder create helper
`createClientReminderRuleFromDraft` is a raw INSERT protected by a unique DB index but is not itself retry-idempotent.
The main client workspace no longer uses this path directly; verify remaining callers and either remove or harden it.

### P2 · Duplicate equivalent workout indexes
Two unique partial indexes currently enforce the same `client_id WHERE status='in_progress'` invariant.
Not a correctness bug; clean up in a schema-maintenance migration after confirming migration history dependencies.

## Verification gate for QA-3 changes

Before merge: Vitest + production build + Playwright mobile behavioral smoke must pass. DB migrations additionally require an authenticated transactional smoke with rollback.

## Next audit slices

1. Auth/reset/first-access + Telegram link token lifecycle.
2. Storage/media orphan detection and cleanup.
3. Remaining CREATE flows: request IDs / server idempotency where useful.
4. DELETE/archive semantics: absent row vs success.
5. Add transactional DB smoke for every P0 invariant and wire it into a controlled CI environment.
