# Training program builder

## Current model

A training program contains one or more **sessions**. A session can be:

- strength;
- cardio;
- mixed.

This supports the common one-day Full Body case without forcing extra structure, while still allowing separate cardio sessions or cardio after strength training.

## Strength blocks

Each exercise in a session stores program-specific prescription:

- main / accessory / optional role;
- sets;
- repetition range;
- optional RIR range;
- rest time;
- substitution group;
- whether the client may substitute;
- trainer note.

These values belong to the program, not the exercise library.

## Cardio blocks

Cardio can exist as its own session or inside a mixed session. Structured fields currently include:

- modality;
- duration;
- target heart-rate range;
- target RPE range;
- speed;
- incline;
- distance;
- note.

Only useful fields should be shown to a client; optional fields may remain null.

## UX rules

- Default new program is a simple Full Body session.
- Extra sessions are optional.
- Exercise chips do not use hashtag symbols.
- Advanced options stay secondary to the core prescription.
- On mobile, adding and editing happens in sheets rather than full-page context switches.
- Exercise order is edited with drag-and-drop from an explicit handle; arrow buttons remain as keyboard/mobile fallback.
- Dropping one exercise onto another creates a two-exercise superset. The trainer UI shows a single visual superset block instead of manual A1/A2 codes; unlinking restores standalone exercises.
- The client workout UI also presents a superset as a pair with plain-language sequencing and rest instructions rather than A1/A2 labels.
- Editing a published client program always happens in a draft revision. The active client version changes only after explicit publication; started/completed workout snapshots are never rewritten.
- A future client workout screen will use fast numeric entry, quick RIR choices and automatic rest timers.

## Data safety

Drafts are saved atomically through the current retry-safe training-program save RPCs.
Published programs use copy-on-edit revisioning: trainer changes stay in a draft until explicit publication, so historical workout prescriptions are not rewritten.
