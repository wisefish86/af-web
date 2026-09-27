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

export type SubstitutionGroup = {
  id: string
  name: string
  purpose: string | null
}

export type Exercise = {
  id: string
  code: string
  name: string
  description: string | null
  instructions: string | null
  equipment_code: string | null
  movement_pattern_code: string | null
  default_rest_seconds: number
  technique_url: string | null
  is_unilateral: boolean
  is_active: boolean
  primary_muscle: string | null
  secondary_muscles: string[]
  tags: ExerciseTag[]
  substitution_groups: SubstitutionGroup[]
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
  equipment_code: string
  movement_pattern_code: string
  default_rest_seconds: number
  technique_url: string
  is_unilateral: boolean
  is_active: boolean
  primary_muscle: string
  secondary_muscles: string[]
  tags: string[]
  substitution_group_ids: string[]
}
