# Modular platform model

The application is designed as a configurable coaching platform rather than a fixed set of pages.

## Client service modules

A client can have any combination of:

- nutrition
- training
- progress
- check-ins
- notifications

The active set is stored in `client_modules`. The frontend builds client navigation from those assignments, so unavailable services are not shown as disabled clutter.

## Configurable tracking

`tracking_fields` is the field catalog.

`client_tracking_config` lets the trainer decide, per client:

- whether a field is enabled;
- whether it is required;
- frequency;
- field-specific settings.

`client_tracking_preferences` stores the client's permitted personal choices:

- hidden from forms;
- reminder on/off.

A client can hide a field only when:
1. the field is allowed to be disabled;
2. it is enabled for that client;
3. it is not required for that client.

This rule is enforced by RLS, not only by the UI.

## Training builder

Reusable building blocks:

- `muscle_groups`
- `exercises`
- `exercise_muscle_groups`
- `exercise_substitution_groups`
- `exercise_substitution_members`

Programs use:
- main/additional exercise role;
- set/repetition/RIR ranges;
- allowed substitution groups;
- template version/source references.

Client workout history stores the actual selected exercise and sets, so later template edits do not rewrite history.

## Nutrition builder

Reusable nutrition plan templates are separate from client assignments.

A client may:
- receive a template;
- have client-specific overrides;
- disable foods through `client_food_preferences`;
- use flexible meal slots by food category.

The global food library is never deleted just because one client does not eat an item.

## Notifications

The schema already supports:
- Telegram;
- email;
- web push.

`reminder_rules` stores client-specific schedules and settings.
`notification_channels` stores verified delivery endpoints.
`notification_deliveries` provides delivery history.

Telegram linking tokens are stored in the private schema and are not exposed through the Data API.

The intended bot behavior is conditional: if the required action is already completed, the reminder should be skipped.

## UX principles

1. Progressive disclosure: show the simplest useful screen first.
2. No dead modules: a client never sees sections not included in their service.
3. Optional means optional: fields can disappear completely instead of being repeatedly skipped.
4. Required fields are controlled by the trainer and cannot be hidden by the client.
5. Safe reversibility: hiding a field never deletes historical data.
6. Templates are reusable; client history is immutable.
7. Mobile-first controls use large touch targets and plain-language labels.
