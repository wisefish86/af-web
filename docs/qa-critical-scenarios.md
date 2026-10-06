# Pre-pilot critical scenario matrix

Priority: P0 must pass before first client; P1 before broader pilot.

| Area | Scenario | Expected server result | Expected UI result | Failure variants |
|---|---|---|---|---|
| Auth P0 | Trainer password login | valid trainer session | trainer workspace opens | timeout, stuck browser lock, wrong password, profile load failure |
| Auth P0 | Client login / Telegram | one valid client session | correct modules/routes | expired link, unlinked Telegram, inactive client |
| Workout P0 | Start workout | exactly one in_progress | active workout opens | double tap, lost RPC response, existing active workout |
| Workout P0 | Save set | one set row with exact values | green check + locked saved row | lost response, 400/500, offline, retry |
| Workout P0 | Failed set save | no committed set | values remain editable in draft | refresh while draft exists |
| Workout P0 | Superset set | same exercise remains open | manual-next hint only | no automatic B1/B2 navigation |
| Workout P0 | Complete exercise/workout | completed state once | history/result available | double submit, lost response |
| Workout P0 | Reopen old workout | reopened_at set, status in_progress | editable workout | midnight cron must not re-close same day |
| Workout P0 | Day rollover | stale session completes once | next open shows completed | timezone boundary, app left open |
| Program P0 | Edit active program | new draft version | current client plan unchanged until publish | save retry, refresh failure |
| Program P0 | Reorder/replace exercise | persisted order/exercise | reload shows exact edit | repeated save, publish |
| Program P0 | Publish edited program | exactly one active version | client sees new version on next plan load | lost response, concurrent publish |
| Nutrition P0 | Switch to calorie mode | tracking_mode=calorie_tracking | Meal Plan library hidden | lost response |
| Nutrition P0 | Return to Meal Plan | existing plan reused | library visible collapsed | no duplicate plan |
| Nutrition P0 | Daily check-in | one semantic daily record | saved state survives reload | lost response, partial load |
| Progress P0 | Weight/waist save | same-day upsert | latest/history agree | timezone/day boundary |
| Feedback P0 | Send exercise comment | one message/request_id | sent even if refresh fails | retry, double tap |
| Notifications P1 | Read/dismiss | exact server state | badge updates immediately | lost response |
| Materials P1 | Open nested Notion material | no app-history corruption | full-size readable content | back navigation, mobile scale |
| Settings P1 | Save profile/contacts | intended fields only | success reflects server | partial multi-write, invalid late field |

Every P0 scenario should eventually have one of: unit/integration test, Playwright E2E, transactional DB smoke, or an explicitly documented manual-device check.
