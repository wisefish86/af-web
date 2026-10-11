import { supabase } from '../../lib/supabase'
import type {
  Exercise, ExerciseDraft, ExerciseLibraryData, ExerciseMedia, ExerciseSubstitutionMembership,
  ExerciseTag, MuscleGroup, SubstitutionGroup, SubstitutionMatchType
} from './types'

type MuscleLink = { exercise_id: string; muscle_group_code: string; role: string }
type ExerciseMediaRow = { id:string; exercise_id:string; kind:string; storage_path:string|null; external_url:string|null; caption:string|null; sort_order:number }
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
      .eq('exercise_scope','global')
      .order('name'),
    supabase.from('muscle_groups').select('code, name, parent_code, sort_order').order('sort_order'),
    supabase.from('exercise_equipment').select('code, name, sort_order').order('sort_order'),
    supabase.from('movement_patterns').select('code, name, sort_order').order('sort_order'),
    supabase.from('exercise_muscle_groups').select('exercise_id, muscle_group_code, role'),
    supabase.from('exercise_tag_links').select('exercise_id, tag_id, exercise_tags(id, name, slug)'),
    supabase.from('exercise_media').select('id, exercise_id, kind, storage_path, external_url, caption, sort_order').order('sort_order'),
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

  const mediaByExercise = new Map<string,ExerciseMedia[]>()
  for (const row of (mediaRes.data ?? []) as ExerciseMediaRow[]) {
    const kind:ExerciseMedia['kind']=row.kind==='animation'?'animation':row.kind==='video'?'video':'image'
    let url:string|null=null
    if (row.storage_path) {
      const { data } = supabase.storage.from('exercise-media').getPublicUrl(row.storage_path)
      url=data.publicUrl
    } else if (row.external_url) {
      url=row.external_url
    }
    if(!url)continue
    const list=mediaByExercise.get(row.exercise_id)??[]
    list.push({id:row.id,kind,url,caption:row.caption??null,sort_order:Number(row.sort_order??100)})
    mediaByExercise.set(row.exercise_id,list)
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
    const media=(mediaByExercise.get(row.id)??[]).slice().sort((a,b)=>a.sort_order-b.sort_order)
    return {
      ...row,
      exercise_type: row.exercise_type as Exercise['exercise_type'],
      tracking_type: row.tracking_type as Exercise['tracking_type'],
      aliases: row.aliases ?? [],
      primary_muscles: primaryMuscles,
      secondary_muscles: muscleLinks.filter(link => link.role === 'secondary').map(link => link.muscle_group_code),
      stabilizer_muscles: muscleLinks.filter(link => link.role === 'stabilizer').map(link => link.muscle_group_code),
      image_url: media.find(item=>item.kind==='image')?.url ?? null,
      animation_url: media.find(item=>item.kind==='animation')?.url ?? null,
      video_url: media.find(item=>item.kind==='video')?.url ?? null,
      media,
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
  if(!error)return

  const {data:existing,error:readError}=await supabase.from('exercise_substitution_groups')
    .select('id')
    .eq('id',id)
    .maybeSingle()
  if(!readError&&!existing)return
  throw error
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

async function exerciseStorageObjectExists(path:string):Promise<boolean|null>{
  if(!supabase)return null
  const parts=path.split('/')
  const name=parts.pop()||''
  const folder=parts.join('/')
  if(!name)return false
  const {data,error}=await supabase.storage.from('exercise-media').list(folder,{limit:100,search:name})
  if(error)return null
  return Boolean(data?.some(item=>item.name===name))
}

async function exerciseMediaPathCommitted(input:{
  exerciseId:string
  kind:'image'|'video'
  path:string
  createdBy:string
}):Promise<boolean|null>{
  if(!supabase)return null
  const {data,error}=await supabase.from('exercise_media')
    .select('id')
    .eq('exercise_id',input.exerciseId)
    .eq('kind',input.kind)
    .eq('storage_path',input.path)
    .eq('created_by',input.createdBy)
    .maybeSingle()
  if(error)return null
  return Boolean(data)
}

async function cleanupUncommittedExerciseUpload(path:string){
  if(!supabase)return
  await supabase.storage.from('exercise-media').remove([path]).catch(()=>undefined)
}

async function activateUploadedExerciseMedia(input:{
  exerciseId:string
  kind:'image'|'video'
  path:string
  sortOrder:number
  createdBy:string
}):Promise<ExerciseMediaUploadResult>{
  if(!supabase)throw new Error('Supabase не подключён')

  // Read the old path only for post-commit Storage cleanup. The DB swap itself
  // is one transactional RPC, so a network failure cannot leave a half-updated slot.
  const {data:oldRows,error:oldError}=await supabase.from('exercise_media')
    .select('storage_path')
    .eq('exercise_id',input.exerciseId)
    .eq('kind',input.kind)
    .eq('created_by',input.createdBy)
  if(oldError){
    await cleanupUncommittedExerciseUpload(input.path)
    throw oldError
  }

  const oldPaths=new Set(
    (oldRows??[])
      .map(row=>row.storage_path)
      .filter((path):path is string=>Boolean(path)&&path!==input.path)
  )

  const {data,error}=await supabase.rpc('replace_my_exercise_media',{
    p_exercise_id:input.exerciseId,
    p_kind:input.kind,
    p_storage_path:input.path,
    p_sort_order:input.sortOrder,
  })

  if(error){
    const committed=await exerciseMediaPathCommitted(input)
    if(committed!==true){
      if(committed===false)await cleanupUncommittedExerciseUpload(input.path)
      // If readback also failed, keep the upload. An orphan is safer than
      // deleting a file that a committed DB row may already reference.
      throw error
    }
  }else{
    const previous=(data as {previous_storage_path:string|null}[]|null)?.[0]?.previous_storage_path
    if(previous&&previous!==input.path)oldPaths.add(previous)
  }

  let storageCleanupFailed=false
  if(oldPaths.size){
    const {error:storageError}=await supabase.storage.from('exercise-media').remove([...oldPaths])
    storageCleanupFailed=Boolean(storageError)
  }

  return {
    url:supabase.storage.from('exercise-media').getPublicUrl(input.path).data.publicUrl,
    storageCleanupFailed,
  }
}

async function uploadExerciseMediaObject(path:string,file:File){
  if(!supabase)throw new Error('Supabase не подключён')
  const {error:uploadError}=await supabase.storage.from('exercise-media')
    .upload(path,file,{contentType:file.type,cacheControl:'31536000',upsert:false})
  if(!uploadError)return

  const exists=await exerciseStorageObjectExists(path)
  if(exists===true)return

  // If the existence check also failed, keep any potentially committed object.
  // A later storage audit can remove an orphan without risking a broken DB reference.
  throw uploadError
}

export async function addExerciseMedia(
  exerciseId:string,
  file:File,
  kind:'image'|'video',
  caption:string|null=null,
):Promise<ExerciseMediaUploadResult>{
  if(!supabase)throw new Error('Supabase не подключён')
  const isImage=kind==='image'
  if(isImage&&!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Поддерживаются JPG, PNG и WebP.')
  if(!isImage&&!['video/mp4','video/webm'].includes(file.type))throw new Error('Поддерживаются MP4 и WebM. Для лучшей совместимости используй MP4 (H.264).')
  if(isImage&&file.size>8*1024*1024)throw new Error('Изображение должно быть не больше 8 МБ.')
  if(!isImage&&file.size>100*1024*1024)throw new Error('Видео должно быть не больше 100 МБ.')

  const {data:authData,error:authError}=await supabase.auth.getUser()
  if(authError||!authData.user)throw authError??new Error('Нужно войти как тренер')

  const ext=isImage?(file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg'):(file.type==='video/webm'?'webm':'mp4')
  const path=`${exerciseId}/${kind}/${crypto.randomUUID()}.${ext}`
  await uploadExerciseMediaObject(path,file)

  const {data:maxRows,error:maxError}=await supabase.from('exercise_media')
    .select('sort_order')
    .eq('exercise_id',exerciseId)
    .eq('kind',kind)
    .order('sort_order',{ascending:false})
    .limit(1)
  if(maxError){
    await cleanupUncommittedExerciseUpload(path).catch(()=>undefined)
    throw maxError
  }
  const sortOrder=(Number(maxRows?.[0]?.sort_order??0)||0)+10

  const {data:inserted,error:insertError}=await supabase.from('exercise_media')
    .insert({
      exercise_id:exerciseId,
      kind,
      storage_path:path,
      external_url:null,
      caption:caption?.trim()||null,
      sort_order:sortOrder,
      created_by:authData.user.id,
    })
    .select('id')
    .single()
  if(insertError){
    await cleanupUncommittedExerciseUpload(path).catch(()=>undefined)
    throw insertError
  }

  return {
    url:supabase.storage.from('exercise-media').getPublicUrl(path).data.publicUrl,
    storageCleanupFailed:false,
  }
}

export async function removeExerciseMediaItem(exerciseId:string,mediaId:string):Promise<{storageCleanupFailed:boolean}>{
  if(!supabase)throw new Error('Supabase не подключён')
  const {data:authData,error:authError}=await supabase.auth.getUser()
  if(authError||!authData.user)throw authError??new Error('Нужно войти как тренер')

  const {data:row,error}=await supabase.from('exercise_media')
    .select('id,storage_path,created_by')
    .eq('id',mediaId)
    .eq('exercise_id',exerciseId)
    .maybeSingle()
  if(error)throw error
  if(!row)return {storageCleanupFailed:false}
  if(row.created_by!==authData.user.id)throw new Error('Это медиа нельзя удалить из текущего профиля.')

  const {error:deleteError}=await supabase.from('exercise_media').delete().eq('id',mediaId).eq('created_by',authData.user.id)
  if(deleteError)throw deleteError

  let storageCleanupFailed=false
  if(row.storage_path){
    const {error:storageError}=await supabase.storage.from('exercise-media').remove([row.storage_path])
    storageCleanupFailed=Boolean(storageError)
  }
  return {storageCleanupFailed}
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
  await uploadExerciseMediaObject(path,file)

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
  await uploadExerciseMediaObject(path,file)

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
  if(deleteError){
    const {data:remaining,error:readError}=await supabase.from('exercise_media').select('id').in('id',ids)
    if(readError||remaining?.length)throw deleteError
  }

  let storageCleanupFailed=false
  if(paths.length){
    const {error:storageError}=await supabase.storage.from('exercise-media').remove(paths)
    storageCleanupFailed=Boolean(storageError)
  }
  return {storageCleanupFailed}
}
