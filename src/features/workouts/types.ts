export type PlanSession = {
  id: string
  name: string
  session_type: 'strength' | 'cardio' | 'mixed'
  planned_duration_minutes: number | null
  notes: string | null
}

export type ActiveTrainingPlan = {
  id: string
  name: string
  description: string | null
  weekly_frequency: number | null
  sessions: PlanSession[]
}

export type WorkoutSetRecord = {
  id?: string
  set_number: number
  weight_kg: number | null
  reps: number | null
  rir: number | null
  is_warmup: boolean
  completed_at: string | null
}

export type PreviousSet = {
  set_number: number
  weight_kg: number | null
  reps: number | null
  rir: number | null
}

export type SubstitutionOption = {
  id: string
  name: string
}

export type LiveWorkoutExercise = {
  id: string
  exercise_id: string
  name: string
  instructions: string | null
  technique_url: string | null
  image_url: string | null
  primary_muscle: string | null
  sort_order: number
  prescribed_sets: number
  reps_min: number | null
  reps_max: number | null
  rir_min: number | null
  rir_max: number | null
  rir_enabled: boolean
  rest_seconds: number
  allow_substitution: boolean
  substitution_group_id: string | null
  substitution_policy: 'strict' | 'flexible' | 'wide'
  exercise_role: 'main' | 'accessory' | 'optional'
  trainer_notes: string | null
  completed_at: string | null
  sets: WorkoutSetRecord[]
  previous_sets: PreviousSet[]
  substitution_options: SubstitutionOption[]
}

export type LiveCardioEntry = {
  id: string
  modality_code: string
  modality_name: string
  name: string | null
  sort_order: number
  prescribed_duration_minutes: number | null
  prescribed_hr_min: number | null
  prescribed_hr_max: number | null
  prescribed_speed_kmh: number | null
  prescribed_incline_percent: number | null
  prescribed_distance_km: number | null
  trainer_notes: string | null
  actual_duration_minutes: number | null
  actual_hr_avg: number | null
  actual_rpe: number | null
  actual_distance_km: number | null
  client_notes: string | null
  completed_at: string | null
}

export type LiveWorkout = {
  id: string
  program_name: string
  session_name: string
  session_type: 'strength' | 'cardio' | 'mixed'
  started_at: string
  status: 'in_progress' | 'completed' | 'abandoned'
  exercises: LiveWorkoutExercise[]
  cardio: LiveCardioEntry[]
}
