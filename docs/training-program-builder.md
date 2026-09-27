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
- A future client workout screen will use fast numeric entry, quick RIR choices and automatic rest timers.

## Data safety

The initial builder creates a draft program atomically through `create_training_program(jsonb)`.
Program versioning/publishing will be added before editing active programs in-place so historical workout prescriptions are not rewritten.
