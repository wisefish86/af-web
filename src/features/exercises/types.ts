export type ExerciseReference = {
  code: string
  name: string
  sort_order: number
}

export type MuscleGroup = ExerciseReference & {
  parent_code: string | null
}

export type ExerciseTag = {
  id: string
  name: string
  slug: string
}

export type ExerciseType = 'compound' | 'isolation' | 'cardio'

export type ExerciseTrackingType =
  | 'weight_reps'
  | 'bodyweight_reps'
  | 'weighted_bodyweight'
  | 'assisted_bodyweight'
  | 'reps_only'
  | 'duration'
  | 'weight_duration'
  | 'distance_duration'
  | 'weight_distance'

export type SubstitutionMatchType = 'direct' | 'acceptable' | 'fallback'

export type SubstitutionGroup = {
  id: string
  code: string | null
  name: string
  purpose: string | null
  scope: 'specific' | 'broad'
  parent_group_id: string | null
}

export type ExerciseSubstitutionMembership = SubstitutionGroup & {
  priority: number
  is_default: boolean
  match_type: SubstitutionMatchType
  membership_notes: string | null
}

export type Exercise = {
  id: string
  code: string
  name: string
  description: string | null
  instructions: string | null
  setup_notes: string | null
  common_mistakes: string | null
  exercise_type: ExerciseType
  tracking_type: ExerciseTrackingType
  aliases: string[]
  equipment_code: string | null
  movement_pattern_code: string | null
  default_rest_seconds: number
  technique_url: string | null
  image_url: string | null
  animation_url: string | null
  video_url: string | null
  is_unilateral: boolean
  is_active: boolean
  primary_muscles: string[]
  secondary_muscles: string[]
  stabilizer_muscles: string[]
  tags: ExerciseTag[]
  substitution_groups: ExerciseSubstitutionMembership[]
}

export type ExerciseLibraryData = {
  exercises: Exercise[]
  muscles: MuscleGroup[]
  equipment: ExerciseReference[]
  patterns: ExerciseReference[]
  substitutionGroups: SubstitutionGroup[]
}

export type ExerciseDraft = {
  id?: string
  name: string
  description: string
  instructions: string
  setup_notes: string
  common_mistakes: string
  aliases: string[]
  exercise_type: ExerciseType | ''
  tracking_type: ExerciseTrackingType
  equipment_code: string
  movement_pattern_code: string
  default_rest_seconds: number
  technique_url: string
  is_unilateral: boolean
  is_active: boolean
  primary_muscles: string[]
  secondary_muscles: string[]
  stabilizer_muscles: string[]
  tags: string[]
  substitution_group_ids: string[]
}
