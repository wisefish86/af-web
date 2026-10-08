#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_DB_URL:?SUPABASE_DB_URL is required}"

readonly_tests=(
  "supabase/tests/least_privilege_table_grants_smoke.sql"
  "supabase/tests/qa3_auth_lifecycle_invariants.sql"
  "supabase/tests/qa3_storage_media_invariants.sql"
  "supabase/tests/security_surface_hardening_smoke.sql"
)

transactional_tests=(
  "supabase/tests/qa3_auth_telegram_lifecycle.sql"
  "supabase/tests/qa3_mutation_hardening.sql"
  "supabase/tests/security_definer_role_boundaries.sql"
  "supabase/tests/training_program_revision_smoke.sql"
  "supabase/tests/workout_controlled_mutations_smoke.sql"
  "supabase/tests/workout_result_correction_smoke.sql"
  "supabase/tests/workout_rpc_only_privileges_smoke.sql"
  "supabase/tests/workout_substitution_integrity_smoke.sql"
  "supabase/tests/persistent_workout_substitution_smoke.sql"
  "supabase/tests/security_invoker_read_rpc_smoke.sql"
  "supabase/tests/atomic_exercise_media_smoke.sql"
  "supabase/tests/workout_cross_device_conflict_smoke.sql"
  "supabase/tests/feedback_notification_reliability_smoke.sql"
  "supabase/tests/trainer_nutrition_publish_reliability_smoke.sql"
  "supabase/tests/trainer_nutrition_draft_resume_smoke.sql"
  "supabase/tests/trainer_nutrition_revision_smoke.sql"
  "supabase/tests/progress_profile_reminder_reliability_smoke.sql"
  "supabase/tests/training_program_revision_race_smoke.sql"
)

check_transactional_test() {
  local file="$1"
  grep -Eiq '^[[:space:]]*begin[[:space:]]*;' "$file" || {
    echo "::error file=$file::Transactional smoke is missing BEGIN;"
    exit 1
  }
  grep -Eiq '^[[:space:]]*rollback[[:space:]]*;' "$file" || {
    echo "::error file=$file::Transactional smoke is missing ROLLBACK;"
    exit 1
  }
  if grep -Eiq '^[[:space:]]*commit[[:space:]]*;' "$file"; then
    echo "::error file=$file::Transactional smoke contains COMMIT;"
    exit 1
  fi
}

run_test() {
  local file="$1"
  echo "==> $file"
  PGOPTIONS='-c statement_timeout=120000 -c lock_timeout=5000'     psql "$SUPABASE_DB_URL"       --set=ON_ERROR_STOP=1       --no-psqlrc       --file="$file"
}

for file in "${readonly_tests[@]}"; do
  [[ -f "$file" ]] || { echo "::error::Missing smoke file: $file"; exit 1; }
  run_test "$file"
done

for file in "${transactional_tests[@]}"; do
  [[ -f "$file" ]] || { echo "::error::Missing smoke file: $file"; exit 1; }
  check_transactional_test "$file"
  run_test "$file"
done

echo "All production DB smokes passed."
