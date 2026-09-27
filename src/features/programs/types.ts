import type { ExerciseLibraryData } from '../exercises/types'

export type ClientOption = {
  id: string
  name: string
}

export type CardioModality = {
  code: string
  name: string
  sort_order: number
}

export type ProgramExerciseItem = {
  local_id: string
  type: 'exercise'
  exercise_id: string
  substitution_group_id: string
  exercise_role: 'main' | 'accessory' | 'optional'
  sets_min: number
  sets_max: number
  reps_min: number | null
  reps_max: number | null
  rir_enabled: boolean
  rir_min: number | null
  rir_max: number | null
  rest_seconds: number
  warmup_enabled: boolean
  warmup_load_percent_min: number
  warmup_load_percent_max: number
  warmup_reps_min: number
  warmup_reps_max: number
  warmup_rest_seconds: number
  warmup_notes: string
  allow_client_substitution: boolean
  substitution_policy: 'strict' | 'flexible' | 'wide'
  notes: string
  progression_notes: string
}

export type ProgramCardioItem = {
  local_id: string
  type: 'cardio'
  modality_code: string
  name: string
  duration_minutes: number | null
  target_hr_min: number | null
  target_hr_max: number | null
  target_rpe_min: number | null
  target_rpe_max: number | null
  speed_kmh: number | null
  incline_percent: number | null
  distance_km: number | null
  notes: string
}

export type ProgramItem = ProgramExerciseItem | ProgramCardioItem

export type ProgramSession = {
  local_id: string
  name: string
  session_type: 'strength' | 'cardio' | 'mixed'
  planned_duration_minutes: number | null
  notes: string
  items: ProgramItem[]
}

export type TrainingProgramDraft = {
  client_id: string
  name: string
  description: string
  weekly_frequency: number | null
  is_template: boolean
  sessions: ProgramSession[]
}

export type ProgramBuilderReferences = {
  library: ExerciseLibraryData
  cardioModalities: CardioModality[]
  clients: ClientOption[]
}
