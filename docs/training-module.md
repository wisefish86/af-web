# Training module

## Product rule

Exercise library, program prescription and completed workout are separate layers.

- **Exercise library**: reusable metadata — muscles, equipment, movement pattern, tags, technique, media and default rest.
- **Program exercise**: client/program-specific prescription — main/accessory role, sets, reps, RIR, rest and allowed substitutions.
- **Workout history**: what the client actually performed.

Changing a library item or a future program must never rewrite workout history.

## Roadmap

1. Exercise library — live CRUD, filters, chips, technique, tags and substitution groups.
2. Program builder — days, drag/reorder, main/accessory roles, sets/reps/RIR/rest, versioning.
3. Client workout screen — instant set saves, previous result, numeric validation, quick RIR chips.
4. Rest timer — auto-start after completed set, per-exercise default with program override.
5. Analytics — volume, best weight, projected 1RM and trends.
6. Exercise media — Supabase Storage, trainer-managed image/video/animation.
7. Progress photos — separate private Storage bucket with RLS.

## Input rules

- Weight accepts comma or dot in the UI and is normalized to a decimal before saving.
- Repetitions are integers.
- RIR is optional and stored as a numeric value; the initial client UI will expose quick values 0 / 1 / 2 / 3 / 4+ / blank.
- Projected 1RM is derived, not stored as source data.
- Completing a set stores `completed_at`, which is the source time for the rest timer.

## Future commercial product

Keep trainer-specific reusable content separate from client data. Before opening the product to multiple independent trainers, add workspace/tenant membership and scope trainer-owned libraries to a workspace. Do this before public multi-trainer onboarding rather than retrofitting it after scale.
