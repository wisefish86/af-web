# Pre-pilot QA state map

This document is the behavioral contract for Andrey-Fit. A green build is not enough: critical transitions must preserve these invariants.

## Auth/session

States: signed_out -> authenticating -> authenticated(client|trainer) -> refreshing -> signed_out.

Invariants:
- A network timeout is not equivalent to invalid credentials.
- A loaded auth session with failed profile/module bootstrap must stop on a retryable error screen, never a fake empty account.
- Trainer routes require role=trainer even when auth succeeds.
- Sign-out is successful only after the auth provider confirms it.

## Training program

States: draft -> active -> archived. Editing an active program creates a new draft/version; it never mutates the currently active version in place.

Invariants:
- At most one active program per client.
- status=active iff is_active=true.
- Empty sessions cannot be published.
- Existing workout snapshots never change when a later program version is edited or published.
- Reorder/replace/add/remove must survive save -> reload -> publish.

## Workout

States: planned -> in_progress -> completed -> reopened(in_progress) -> completed.

Invariants:
- At most one in_progress workout per client.
- Reopen changes the rollover anchor to reopened_at; midnight cleanup must not immediately re-close it.
- A completed workout cannot accept new sets until the whole workout is reopened.
- Client UI must reconcile with server state after uncertain responses.
- Day boundaries use the client profile timezone.

## Exercise/set

Set states: draft -> saving -> saved/completed; failed save -> editable draft.

Invariants:
- Lost response + committed server write = saved, not duplicate.
- Real failure restores an editable draft.
- 0-row update/delete is not success.
- Finish exercise is unavailable until at least one working set is saved.
- Superset exercises never auto-navigate; UI only suggests the manual next step.

## Nutrition

Modes: meal_plan | calorie_tracking.

Invariants:
- Personal meal/favorite library is visible only in Meal Plan mode and collapsed by default.
- Only one active Meal Plan per client.
- Editing a published Meal Plan creates a new version.
- Manual calorie mode requires calories before daily save.
- Partial load failure must not erase drafts or masquerade as empty data.

## Progress/check-ins

Invariants:
- Dates are interpreted in client timezone.
- Same-day measurement updates the existing day rather than silently duplicating it.
- Undefined numeric fields do not erase existing values; explicit comment clearing does.
- Monthly rating scale is 1..10.

## Notifications/reminders

Invariants:
- Enabled rule requires at least one weekday.
- Repeated creation must not create duplicate semantic rules.
- Badge counts only delivered, unread in-app notifications.
- Deep links resolve to the exact target screen/entity.

## Failure contract for every mutation

For INSERT/UPDATE/DELETE/RPC/storage/auth:
1. request succeeds -> UI reflects server state;
2. response is lost -> read-after-write or idempotent retry recovers success;
3. request really fails -> draft remains editable;
4. refresh after success fails -> primary action is still reported as success;
5. double tap -> no duplicate;
6. server returns 0 affected rows -> not success;
7. app reload -> state is reconstructed from server/local recovery without contradiction.
