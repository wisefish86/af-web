# Architecture

## Source of truth
- GitHub: application source, workflows and schema history.
- Supabase PostgreSQL: editable application data.
- Supabase Auth: users and sessions.
- FTP hosting: built frontend only; no business data or secrets.

## Application modules
- Auth and profiles
- Trainer/client relationships
- Nutrition targets and food catalog
- Meal templates and slots
- Exercises and substitution groups
- Training programs and workout history
- Measurements and daily/monthly check-ins

## Security
- Browser uses only a Supabase publishable key.
- Secret/service-role keys are never shipped to the browser.
- Public schema tables use Row Level Security.
- Anonymous database table access is revoked.
- Client data is limited to the client and assigned trainer.
- Roles are not editable by the user through profile update grants.

## Frontend
React + TypeScript + Vite. UI is responsive and mobile-first. Demo data exists only for preview mode and will be replaced module-by-module with Supabase repositories.

## Deployment target
Development flow:
1. Edit/commit in GitHub.
2. CI builds every push.
3. Local preview via GitHub Desktop + start.bat.
4. Later: GitHub Actions deploy built dist to a dedicated FTP test folder.
5. Production deploy only after explicit promotion.
