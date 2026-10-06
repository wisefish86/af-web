import { supabase } from '../../lib/supabase'
import type {
  Exercise, ExerciseDraft, ExerciseLibraryData, ExerciseSubstitutionMembership,
  ExerciseTag, MuscleGroup, SubstitutionGroup, SubstitutionMatchType
} from './types'

type MuscleLink = { exercise_id: string; muscle_group_code: string; role: string }
type ExerciseMediaRow = { id:string; exercise_id:string; kind:string; storage_path:string|null; external_url:string|null; sort_order:number }
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

  const [exerciseRes, muscleRes, equipmentRes, patternRes, muscleLinkRes, tagLinkRes, mediaRes, groupRes, groupLinkRes] = await Promise.all([
    supabase
      .from('exercises')
      .select('id, code, name, description, instructions, setup_notes, common_mistakes, exercise_type, tracking_type, aliases, equipment_code, movement_pattern_code, default_rest_seconds, technique_url, is_unilateral, is_active')
      .order('name'),
    supabase.from('muscle_groups').select('code, name, parent_code, sort_order').order('sort_order'),
    supabase.from('exercise_equipment').select('code, name, sort_order').order('sort_order'),
    supabase.from('movement_patterns').select('code, name, sort_order').order('sort_order'),
    supabase.from('exercise_muscle_groups').select('exercise_id, muscle_group_code, role'),
    supabase.from('exercise_tag_links').select('exercise_id, tag_id, exercise_tags(id, name, slug)'),
    supabase.from('exercise_media').select('id, exercise_id, kind, storage_path, external_url, sort_order').order('sort_order'),
    supabase.from('exercise_substitution_groups').select('id, code, name, purpose, scope, parent_group_id').order('name'),
    supabase.from('exercise_substitution_members').select(
      'exercise_id, group_id, priority, is_default, match_type, notes, exercise_substitution_groups(id, code, name, purpose, scope, parent_group_id)'
    ),
  ])

  const error =
    exerciseRes.error || muscleRes.error || equipmentRes.error || patternRes.error ||
    muscleLinkRes.error || tagLinkRes.error || mediaRes.error || groupRes.error || groupLinkRes.error
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

  const imageByExercise = new Map<string,string>()
  const animationByExercise = new Map<string,string>()
  const videoByExercise = new Map<string,string>()
  for (const row of (mediaRes.data ?? []) as ExerciseMediaRow[]) {
    const target=row.kind==='animation'?animationByExercise:row.kind==='video'?videoByExercise:imageByExercise
    if (target.has(row.exercise_id)) continue
    if (row.storage_path) {
      const { data } = supabase.storage.from('exercise-media').getPublicUrl(row.storage_path)
      target.set(row.exercise_id,data.publicUrl)
    } else if (row.external_url) {
      target.set(row.exercise_id,row.external_url)
    }
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
      exercise_type: row.exercise_type as Exercise['exercise_type'],
      tracking_type: row.tracking_type as Exercise['tracking_type'],
      aliases: row.aliases ?? [],
      primary_muscles: primaryMuscles,
      secondary_muscles: muscleLinks.filter(link => link.role === 'secondary').map(link => link.muscle_group_code),
      stabilizer_muscles: muscleLinks.filter(link => link.role === 'stabilizer').map(link => link.muscle_group_code),
      image_url: imageByExercise.get(row.id) ?? null,
      animation_url: animationByExercise.get(row.id) ?? null,
      video_url: videoByExercise.get(row.id) ?? null,
      tags: tagsByExercise.get(row.id) ?? [],
      substitution_groups: (groupsByExercise.get(row.id) ?? []).sort((a,b) => (a.scope === b.scope ? a.priority - b.priority : a.scope === 'specific' ? -1 : 1)),
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

  const { data, error } = await supabase.rpc('save_exercise_v2', {
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
      exercise_type: draft.exercise_type || 'compound',
      tracking_type: draft.tracking_type,
      aliases: draft.aliases,
      is_active: draft.is_active,
    },
    p_primary_muscles: draft.primary_muscles,
    p_secondary_muscles: draft.secondary_muscles,
    p_stabilizer_muscles: draft.stabilizer_muscles,
    p_tags: draft.tags,
    p_substitution_group_ids: draft.substitution_group_ids,
  })

  if (error) throw error
  return data as string
}

export async function saveExerciseWithNewGroups(draft:ExerciseDraft,newGroupNames:string[]):Promise<string>{
  if(!supabase)throw new Error('Supabase не подключён')
  const existingGroupIds=draft.substitution_group_ids.filter(id=>!id.startsWith('draft-group-'))
  const {data,error}=await supabase.rpc('save_exercise_with_new_groups',{
    p_exercise:{
      id:draft.id??null,
      name:draft.name,
      description:draft.description||null,
      equipment_code:draft.equipment_code||null,
      movement_pattern_code:draft.movement_pattern_code||null,
      default_rest_seconds:draft.default_rest_seconds,
      technique_url:draft.technique_url||null,
      is_unilateral:draft.is_unilateral,
      instructions:draft.instructions||null,
      setup_notes:draft.setup_notes||null,
      common_mistakes:draft.common_mistakes||null,
      exercise_type:draft.exercise_type||'compound',
      tracking_type:draft.tracking_type,
      aliases:draft.aliases,
      is_active:draft.is_active,
    },
    p_primary_muscles:draft.primary_muscles,
    p_secondary_muscles:draft.secondary_muscles,
    p_stabilizer_muscles:draft.stabilizer_muscles,
    p_tags:draft.tags,
    p_existing_group_ids:existingGroupIds,
    p_new_group_names:newGroupNames,
  })
  if(error)throw error
  return data as string
}

export async function createSubstitutionGroup(name:string,purpose?:string,stableCode?:string):Promise<SubstitutionGroup>{
  if(!supabase)throw new Error('Supabase не подключён')
  const db=supabase
  const {data:authData,error:authError}=await db.auth.getUser()
  if(authError||!authData.user)throw authError??new Error('Нужно войти как тренер')

  const code=(stableCode?.trim()||('CUSTOM_'+crypto.randomUUID().replaceAll('-','').slice(0,10))).toUpperCase()
  const payload={
    code,
    name:name.trim(),
    purpose:purpose?.trim()||null,
    scope:'specific' as const,
    created_by:authData.user.id,
  }
  const {data,error}=await db.from('exercise_substitution_groups')
    .insert(payload)
    .select('id,code,name,purpose,scope,parent_group_id')
    .single()
  if(!error)return data as SubstitutionGroup

  const {data:existing,error:readError}=await db.from('exercise_substitution_groups')
    .select('id,code,name,purpose,scope,parent_group_id')
    .eq('code',code)
    .eq('created_by',authData.user.id)
    .maybeSingle()
  if(!readError&&existing)return existing as SubstitutionGroup
  throw error
}


export async function deleteSubstitutionGroup(id:string):Promise<void>{
  if(!supabase)throw new Error('Supabase не подключён')
  const {error}=await supabase.from('exercise_substitution_groups').delete().eq('id',id).select('id').single()
  if(error)throw error
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


type ExerciseMediaUploadResult={url:string;storageCleanupFailed:boolean}

async function activateUploadedExerciseMedia(input:{
  exerciseId:string
  kind:'image'|'video'
  path:string
  sortOrder:number
  createdBy:string
}):Promise<ExerciseMediaUploadResult>{
  if(!supabase)throw new Error('Supabase не подключён')
  const {data:oldRows,error:oldError}=await supabase.from('exercise_media')
    .select('id,storage_path,created_by')
    .eq('exercise_id',input.exerciseId)
    .eq('kind',input.kind)
    .order('sort_order')
  if(oldError){
    await supabase.storage.from('exercise-media').remove([input.path])
    throw oldError
  }

  const ownedRows=(oldRows??[]).filter(row=>row.created_by===input.createdBy)
  const oldPaths=ownedRows.map(row=>row.storage_path).filter((p):p is string=>Boolean(p)&&p!==input.path)
  if(ownedRows.length){
    const [primary,...extra]=ownedRows
    if(extra.length){
      const {error:extraDeleteError}=await supabase.from('exercise_media').delete().in('id',extra.map(row=>row.id))
      if(extraDeleteError){
        await supabase.storage.from('exercise-media').remove([input.path])
        throw extraDeleteError
      }
    }
    const {error:updateError}=await supabase.from('exercise_media').update({
      storage_path:input.path,
      external_url:null,
      caption:null,
      sort_order:input.sortOrder,
      created_by:input.createdBy,
    }).eq('id',primary.id).select('id').single()
    if(updateError){
      await supabase.storage.from('exercise-media').remove([input.path])
      throw updateError
    }
  }else{
    const {error:insertError}=await supabase.from('exercise_media').insert({
      exercise_id:input.exerciseId,
      kind:input.kind,
      storage_path:input.path,
      external_url:null,
      caption:null,
      sort_order:input.sortOrder,
      created_by:input.createdBy,
    }).select('id').single()
    if(insertError){
      await supabase.storage.from('exercise-media').remove([input.path])
      throw insertError
    }
  }

  let storageCleanupFailed=false
  if(oldPaths.length){
    const {error:storageError}=await supabase.storage.from('exercise-media').remove(oldPaths)
    storageCleanupFailed=Boolean(storageError)
  }
  return {
    url:supabase.storage.from('exercise-media').getPublicUrl(input.path).data.publicUrl,
    storageCleanupFailed,
  }
}

export async function uploadExerciseImage(exerciseId:string,file:File):Promise<ExerciseMediaUploadResult> {
  if (!supabase) throw new Error('Supabase не подключён')
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) {
    throw new Error('Поддерживаются JPG, PNG и WebP.')
  }
  if (file.size > 2 * 1024 * 1024) throw new Error('Изображение должно быть не больше 2 МБ.')

  const { data:authData,error:authError } = await supabase.auth.getUser()
  if (authError || !authData.user) throw authError ?? new Error('Нужно войти как тренер')

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${exerciseId}/${crypto.randomUUID()}.${ext}`
  const {error:uploadError}=await supabase.storage.from('exercise-media')
    .upload(path,file,{contentType:file.type,cacheControl:'31536000',upsert:false})
  if(uploadError)throw uploadError

  return activateUploadedExerciseMedia({
    exerciseId,kind:'image',path,sortOrder:0,createdBy:authData.user.id,
  })
}

export async function uploadExerciseVideo(exerciseId:string,file:File):Promise<ExerciseMediaUploadResult> {
  if (!supabase) throw new Error('Supabase не подключён')
  if (!['video/mp4','video/webm'].includes(file.type)) {
    throw new Error('Поддерживаются MP4 и WebM. Для лучшей совместимости используй MP4 (H.264).')
  }
  if (file.size > 50 * 1024 * 1024) throw new Error('Видео должно быть не больше 50 МБ.')

  const { data:authData,error:authError } = await supabase.auth.getUser()
  if (authError || !authData.user) throw authError ?? new Error('Нужно войти как тренер')

  const ext = file.type === 'video/webm' ? 'webm' : 'mp4'
  const path = `${exerciseId}/video/${crypto.randomUUID()}.${ext}`
  const {error:uploadError}=await supabase.storage.from('exercise-media')
    .upload(path,file,{contentType:file.type,cacheControl:'31536000',upsert:false})
  if(uploadError)throw uploadError

  return activateUploadedExerciseMedia({
    exerciseId,kind:'video',path,sortOrder:0,createdBy:authData.user.id,
  })
}


export async function removeExerciseVideo(exerciseId:string):Promise<{storageCleanupFailed:boolean}> {
  if (!supabase) throw new Error('Supabase не подключён')
  const {data:authData,error:authError}=await supabase.auth.getUser()
  if(authError||!authData.user)throw authError??new Error('Нужно войти как тренер')

  const {data:rows,error}=await supabase.from('exercise_media')
    .select('id,storage_path,created_by')
    .eq('exercise_id',exerciseId)
    .eq('kind','video')
  if(error)throw error

  const owned=(rows??[]).filter(row=>row.created_by===authData.user.id)
  if(!owned.length)return {storageCleanupFailed:false}

  const ids=owned.map(row=>row.id)
  const paths=owned.map(row=>row.storage_path).filter((p):p is string=>Boolean(p))
  const {error:deleteError}=await supabase.from('exercise_media').delete().in('id',ids)
  if(deleteError)throw deleteError

  let storageCleanupFailed=false
  if(paths.length){
    const {error:storageError}=await supabase.storage.from('exercise-media').remove(paths)
    storageCleanupFailed=Boolean(storageError)
  }
  return {storageCleanupFailed}
}
