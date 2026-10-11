import { supabase } from '../../lib/supabase'
import { loadExerciseLibrary } from '../exercises/service'
import type { ProgramBuilderReferences, TrainingProgramDraft } from './types'
import { normalizeProgramSupersetAdjacency, trainingProgramPayload, trainingProgramWarmups } from './model'

export async function loadProgramBuilderReferences(): Promise<ProgramBuilderReferences> {
  if (!supabase) throw new Error('Supabase не подключён')

  const [{ data: authData, error: authError }, library, cardioRes] = await Promise.all([
    supabase.auth.getUser(),
    loadExerciseLibrary(),
    supabase.from('cardio_modalities').select('code, name, sort_order').order('sort_order'),
  ])

  if (authError || !authData.user) throw authError ?? new Error('Нужно войти как тренер')
  if (cardioRes.error) throw cardioRes.error

  const { data: relations, error: relationError } = await supabase
    .from('coach_clients')
    .select('client_id')
    .eq('coach_id', authData.user.id)
    .eq('status', 'active')

  if (relationError) throw relationError

  const clientIds = (relations ?? []).map(item => item.client_id)
  let clients: ProgramBuilderReferences['clients'] = []

  if (clientIds.length) {
    const { data: profileRows, error: profileError } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', clientIds)
      .order('display_name')

    if (profileError) throw profileError
    clients = (profileRows ?? []).map(row => ({ id: row.id, name: row.display_name }))
  }

  return {
    library,
    cardioModalities: cardioRes.data ?? [],
    clients,
  }
}

export async function createTrainingProgram(draft: TrainingProgramDraft, replaceDraftId:string|null=null): Promise<string> {
  if (!supabase) throw new Error('Supabase не подключён')
  const payload=trainingProgramPayload(draft)
  const warmups=trainingProgramWarmups(draft)

  const {data,error}=replaceDraftId
    ? await supabase.rpc('replace_training_program_draft',{p_old_program_id:replaceDraftId,p_program:payload,p_warmups:warmups})
    : await supabase.rpc('create_training_program_with_warmups',{p_program:payload,p_warmups:warmups})
  if(error) throw error
  return data as string
}

export type TrainingProgramSaveRequest={
  requestId:string
  replaceDraftId:string|null
  revisionSourceId:string|null
}

export async function saveTrainingProgramDraft(draft:TrainingProgramDraft,request:TrainingProgramSaveRequest):Promise<string>{
  if(!supabase)throw new Error('Supabase не подключён')
  if(request.replaceDraftId&&request.revisionSourceId)throw new Error('Invalid program save mode')
  const {data,error}=await supabase.rpc('save_training_program_draft_v2',{
    p_request_id:request.requestId,
    p_old_program_id:request.replaceDraftId,
    p_source_program_id:request.revisionSourceId,
    p_program:trainingProgramPayload(draft),
    p_warmups:trainingProgramWarmups(draft),
  })
  if(error)throw error
  return data as string
}

export async function findTrainingProgramSaveResult(requestId:string):Promise<string|null>{
  if(!supabase)throw new Error('Supabase не подключён')
  const {data,error}=await supabase.from('training_programs')
    .select('id')
    .eq('save_request_id',requestId)
    .maybeSingle()
  if(error)throw error
  return data?.id??null
}

export type TrainingProgramEditorSource={
  id:string
  status:string
  version:number
  family_id:string
  draft:TrainingProgramDraft
}

export async function loadTrainingProgramForEdit(programId:string):Promise<TrainingProgramEditorSource>{
  if(!supabase)throw new Error('Supabase не подключён')
  const {data:auth,error:authError}=await supabase.auth.getUser()
  if(authError||!auth.user)throw authError??new Error('Нужно войти как тренер')

  const {data:program,error:programError}=await supabase.from('training_programs')
    .select('id,client_id,name,description,is_template,version,status,weekly_frequency,family_id')
    .eq('id',programId)
    .eq('created_by',auth.user.id)
    .single()
  if(programError)throw programError

  const {data:days,error:daysError}=await supabase.from('training_days')
    .select('id,day_index,name,notes,session_type,planned_duration_minutes')
    .eq('program_id',programId)
    .order('day_index')
  if(daysError)throw daysError
  const dayIds=(days??[]).map(day=>day.id)

  const [exerciseResult,cardioResult]=dayIds.length
    ? await Promise.all([
        supabase.from('program_exercises')
          .select('id,training_day_id,substitution_group_id,default_exercise_id,sort_order,sets_min,sets_max,reps_min,reps_max,rir_min,rir_max,notes,exercise_role,progression_notes,rest_seconds,rir_enabled,allow_client_substitution,substitution_policy,warmup_enabled,warmup_load_percent_min,warmup_load_percent_max,warmup_reps_min,warmup_reps_max,warmup_notes,warmup_rest_seconds,superset_group,superset_position')
          .in('training_day_id',dayIds),
        supabase.from('program_cardio_blocks')
          .select('id,training_day_id,modality_code,name,sort_order,duration_minutes,target_hr_min,target_hr_max,target_rpe_min,target_rpe_max,speed_kmh,incline_percent,distance_km,notes')
          .in('training_day_id',dayIds),
      ])
    : [{data:[],error:null},{data:[],error:null}]
  if(exerciseResult.error)throw exerciseResult.error
  if(cardioResult.error)throw cardioResult.error

  const sessions:TrainingProgramDraft['sessions']=(days??[]).map(day=>{
    const exerciseItems=(exerciseResult.data??[])
      .filter(item=>item.training_day_id===day.id)
      .map(item=>({
        sort_order:Number(item.sort_order),
        value:{
          local_id:item.id,
          type:'exercise' as const,
          exercise_id:item.default_exercise_id,
          substitution_group_id:item.substitution_group_id??'',
          exercise_role:(item.exercise_role??'main') as 'main'|'accessory'|'optional',
          sets_min:Number(item.sets_min??3),
          sets_max:Number(item.sets_max??item.sets_min??3),
          reps_min:item.reps_min==null?null:Number(item.reps_min),
          reps_max:item.reps_max==null?null:Number(item.reps_max),
          rir_enabled:item.rir_enabled!==false,
          rir_min:item.rir_min==null?null:Number(item.rir_min),
          rir_max:item.rir_max==null?null:Number(item.rir_max),
          rest_seconds:Number(item.rest_seconds??120),
          warmup_enabled:Boolean(item.warmup_enabled),
          warmup_load_percent_min:Number(item.warmup_load_percent_min??50),
          warmup_load_percent_max:Number(item.warmup_load_percent_max??60),
          warmup_reps_min:Number(item.warmup_reps_min??8),
          warmup_reps_max:Number(item.warmup_reps_max??10),
          warmup_rest_seconds:Number(item.warmup_rest_seconds??60),
          warmup_notes:item.warmup_notes??'',
          allow_client_substitution:item.allow_client_substitution!==false,
          substitution_policy:(item.substitution_policy??'strict') as 'strict'|'flexible'|'wide',
          notes:item.notes??'',
          progression_notes:item.progression_notes??'',
          superset_group:item.superset_group==null?null:Number(item.superset_group),
          superset_position:item.superset_position===1||item.superset_position===2?item.superset_position:null,
        },
      }))
    const cardioItems=(cardioResult.data??[])
      .filter(item=>item.training_day_id===day.id)
      .map(item=>({
        sort_order:Number(item.sort_order),
        value:{
          local_id:item.id,
          type:'cardio' as const,
          modality_code:item.modality_code,
          name:item.name??'',
          duration_minutes:item.duration_minutes==null?null:Number(item.duration_minutes),
          target_hr_min:item.target_hr_min==null?null:Number(item.target_hr_min),
          target_hr_max:item.target_hr_max==null?null:Number(item.target_hr_max),
          target_rpe_min:item.target_rpe_min==null?null:Number(item.target_rpe_min),
          target_rpe_max:item.target_rpe_max==null?null:Number(item.target_rpe_max),
          speed_kmh:item.speed_kmh==null?null:Number(item.speed_kmh),
          incline_percent:item.incline_percent==null?null:Number(item.incline_percent),
          distance_km:item.distance_km==null?null:Number(item.distance_km),
          notes:item.notes??'',
        },
      }))
    return {
      local_id:day.id,
      name:day.name,
      session_type:(day.session_type??'strength') as 'strength'|'cardio'|'mixed',
      planned_duration_minutes:day.planned_duration_minutes==null?null:Number(day.planned_duration_minutes),
      notes:day.notes??'',
      items:normalizeProgramSupersetAdjacency([...exerciseItems,...cardioItems].sort((a,b)=>a.sort_order-b.sort_order).map(item=>item.value)),
    }
  })

  return {
    id:program.id,
    status:program.status,
    version:Number(program.version),
    family_id:program.family_id,
    draft:{
      client_id:program.client_id??'',
      name:program.name,
      description:program.description??'',
      weekly_frequency:program.weekly_frequency==null?null:Number(program.weekly_frequency),
      is_template:Boolean(program.is_template),
      sessions,
    },
  }
}

export async function createTrainingProgramRevision(sourceProgramId:string,draft:TrainingProgramDraft):Promise<string>{
  if(!supabase)throw new Error('Supabase не подключён')
  const {data,error}=await supabase.rpc('create_training_program_revision',{
    p_source_program_id:sourceProgramId,
    p_program:trainingProgramPayload(draft),
    p_warmups:trainingProgramWarmups(draft),
  })
  if(error)throw error
  return data as string
}

export async function activateTrainingProgram(programId:string):Promise<string> {
  if (!supabase) throw new Error('Supabase не подключён')
  const { data,error }=await supabase.rpc('activate_training_program',{p_program_id:programId})
  if (error) throw error
  return data as string
}


export type TrainerProgramSummary = {
  id:string
  name:string
  client_id:string|null
  client_name:string|null
  status:string
  is_active:boolean
  is_template:boolean
  version:number
  weekly_frequency:number
  created_at:string
  family_id?:string|null
  supersedes_program_id?:string|null
}

export async function loadTrainerPrograms():Promise<TrainerProgramSummary[]> {
  if (!supabase) throw new Error('Supabase не подключён')
  const {data:auth,error:authError}=await supabase.auth.getUser()
  if(authError||!auth.user)throw authError??new Error('Нужно войти как тренер')
  const {data,error}=await supabase.from('training_programs')
    .select('id,name,client_id,status,is_active,is_template,version,weekly_frequency,created_at,family_id,supersedes_program_id')
    .eq('created_by',auth.user.id).order('created_at',{ascending:false})
  if(error)throw error
  const ids=[...new Set((data??[]).flatMap(p=>p.client_id?[p.client_id]:[]))]
  let names=new Map<string,string>()
  if(ids.length){
    const {data:profiles,error:profileError}=await supabase.from('profiles').select('id,display_name').in('id',ids)
    if(profileError)throw profileError
    names=new Map((profiles??[]).map(p=>[p.id,p.display_name]))
  }
  return (data??[]).map(p=>({...p,client_name:p.client_id?names.get(p.client_id)??null:null}))
}

export async function loadClientTrainingPrograms(clientId:string):Promise<TrainerProgramSummary[]> {
  return (await loadTrainerPrograms()).filter(p=>p.client_id===clientId)
}

export async function assignTrainingProgramCopy(sourceProgramId:string,clientId:string):Promise<string>{
  if(!supabase)throw new Error('Supabase не подключён')
  const {data,error}=await supabase.rpc('assign_training_program_copy',{p_source_program_id:sourceProgramId,p_client_id:clientId})
  if(error)throw error
  return data as string
}
