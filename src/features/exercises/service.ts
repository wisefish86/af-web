import { supabase } from '../../lib/supabase'
import type {
  Exercise, ExerciseDraft, ExerciseLibraryData, ExerciseSubstitutionMembership,
  ExerciseTag, MuscleGroup, SubstitutionGroup, SubstitutionMatchType
} from './types'

type MuscleLink = { exercise_id: string; muscle_group_code: string; role: string }
type TagLink = { exercise_id: string; tag_id: string; exercise_tags: ExerciseTag | ExerciseTag[] | null }
type GroupLink = {
  exercise_id: string
  group_id: string
  priority: number
  is_default: boolean
  match_type: 'direct' | 'acceptable' | 'fallback'
  notes: string | null
  exercise_substitution_groups: SubstitutionGroup | SubstitutionGroup[] | null
}

function one<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value
}

export async function loadExerciseLibrary(): Promise<ExerciseLibraryData> {
  if (!supabase) throw new Error('Supabase не подключён')

  const [exerciseRes, muscleRes, equipmentRes, patternRes, muscleLinkRes, tagLinkRes, groupRes, groupLinkRes] = await Promise.all([
    supabase
      .from('exercises')
      .select('id, code, name, description, instructions, setup_notes, common_mistakes, mechanics, equipment_code, movement_pattern_code, default_rest_seconds, technique_url, is_unilateral, is_active')
      .order('name'),
    supabase.from('muscle_groups').select('code, name, parent_code, sort_order').order('sort_order'),
    supabase.from('exercise_equipment').select('code, name, sort_order').order('sort_order'),
    supabase.from('movement_patterns').select('code, name, sort_order').order('sort_order'),
    supabase.from('exercise_muscle_groups').select('exercise_id, muscle_group_code, role'),
    supabase.from('exercise_tag_links').select('exercise_id, tag_id, exercise_tags(id, name, slug)'),
    supabase.from('exercise_substitution_groups').select('id, code, name, purpose, scope, parent_group_id').order('name'),
    supabase.from('exercise_substitution_members').select(
      'exercise_id, group_id, priority, is_default, match_type, notes, exercise_substitution_groups(id, code, name, purpose, scope, parent_group_id)'
    ),
  ])

  const error =
    exerciseRes.error || muscleRes.error || equipmentRes.error || patternRes.error ||
    muscleLinkRes.error || tagLinkRes.error || groupRes.error || groupLinkRes.error
  if (error) throw error

  const musclesByExercise = new Map<string, MuscleLink[]>()
  for (const link of (muscleLinkRes.data ?? []) as MuscleLink[]) {
    const list = musclesByExercise.get(link.exercise_id) ?? []
    list.push(link)
    musclesByExercise.set(link.exercise_id, list)
  }

  const tagsByExercise = new Map<string, ExerciseTag[]>()
  for (const link of (tagLinkRes.data ?? []) as unknown as TagLink[]) {
    const tag = one(link.exercise_tags)
    if (!tag) continue
    const list = tagsByExercise.get(link.exercise_id) ?? []
    list.push(tag)
    tagsByExercise.set(link.exercise_id, list)
  }

  const groupsByExercise = new Map<string, ExerciseSubstitutionMembership[]>()
  for (const link of (groupLinkRes.data ?? []) as unknown as GroupLink[]) {
    const group = one(link.exercise_substitution_groups)
    if (!group) continue
    const list = groupsByExercise.get(link.exercise_id) ?? []
    list.push({
      ...group,
      priority: link.priority,
      is_default: link.is_default,
      match_type: link.match_type,
      membership_notes: link.notes,
    })
    groupsByExercise.set(link.exercise_id, list)
  }

  const exercises: Exercise[] = (exerciseRes.data ?? []).map(row => {
    const muscleLinks = musclesByExercise.get(row.id) ?? []
    const primaryMuscles = muscleLinks.filter(link => link.role === 'primary').map(link => link.muscle_group_code)
    return {
      ...row,
      mechanics: row.mechanics as Exercise['mechanics'],
      primary_muscle: primaryMuscles[0] ?? null,
      primary_muscles: primaryMuscles,
      secondary_muscles: muscleLinks.filter(link => link.role === 'secondary').map(link => link.muscle_group_code),
      stabilizer_muscles: muscleLinks.filter(link => link.role === 'stabilizer').map(link => link.muscle_group_code),
      tags: tagsByExercise.get(row.id) ?? [],
      substitution_groups: (groupsByExercise.get(row.id) ?? []).sort((a,b) => a.priority - b.priority),
    }
  })

  return {
    exercises,
    muscles: (muscleRes.data ?? []) as MuscleGroup[],
    equipment: equipmentRes.data ?? [],
    patterns: patternRes.data ?? [],
    substitutionGroups: (groupRes.data ?? []) as SubstitutionGroup[],
  }
}

export async function saveExercise(draft: ExerciseDraft): Promise<string> {
  if (!supabase) throw new Error('Supabase не подключён')

  const { data, error } = await supabase.rpc('save_exercise', {
    p_exercise: {
      id: draft.id ?? null,
      name: draft.name,
      description: draft.description || null,
      equipment_code: draft.equipment_code || null,
      movement_pattern_code: draft.movement_pattern_code || null,
      default_rest_seconds: draft.default_rest_seconds,
      technique_url: draft.technique_url || null,
      is_unilateral: draft.is_unilateral,
      instructions: draft.instructions || null,
      setup_notes: draft.setup_notes || null,
      common_mistakes: draft.common_mistakes || null,
      mechanics: draft.mechanics || null,
      is_active: draft.is_active,
    },
    p_primary_muscle: draft.primary_muscle || null,
    p_secondary_muscles: draft.secondary_muscles,
    p_tags: draft.tags,
    p_substitution_group_ids: draft.substitution_group_ids,
  })

  if (error) throw error
  return data as string
}

export async function createSubstitutionGroup(name: string, purpose?: string): Promise<SubstitutionGroup> {
  if (!supabase) throw new Error('Supabase не подключён')

  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) throw authError ?? new Error('Нужно войти как тренер')

  const code = `CUSTOM_${crypto.randomUUID().replaceAll('-','').slice(0,10).toUpperCase()}`
  const { data, error } = await supabase
    .from('exercise_substitution_groups')
    .insert({
      code,
      name: name.trim(),
      purpose: purpose?.trim() || null,
      scope: 'specific',
      created_by: authData.user.id,
    })
    .select('id, code, name, purpose, scope, parent_group_id')
    .single()

  if (error) throw error
  return data as SubstitutionGroup
}


export type ReplacementMemberDraft = {
  exercise_id: string
  match_type: SubstitutionMatchType
  is_default: boolean
  notes: string
}

export async function saveSubstitutionGroup(
  group: Pick<SubstitutionGroup,'id'|'name'|'purpose'|'scope'|'parent_group_id'>,
  members: ReplacementMemberDraft[],
): Promise<void> {
  if (!supabase) throw new Error('Supabase не подключён')

  const { error } = await supabase.rpc('save_substitution_group', {
    p_group: {
      id:group.id,
      name:group.name.trim(),
      purpose:group.purpose?.trim() || null,
      scope:group.scope,
      parent_group_id:group.scope === 'specific' ? group.parent_group_id : null,
    },
    p_members: members.map(member=>({
      exercise_id:member.exercise_id,
      match_type:member.match_type,
      is_default:member.is_default,
      notes:member.notes.trim() || null,
    })),
  })

  if (error) throw error
}
