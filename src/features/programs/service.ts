import { supabase } from '../../lib/supabase'
import { loadExerciseLibrary } from '../exercises/service'
import type { ProgramBuilderReferences, TrainingProgramDraft } from './types'

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

export async function createTrainingProgram(draft: TrainingProgramDraft): Promise<string> {
  if (!supabase) throw new Error('Supabase не подключён')

  const payload = {
    client_id: draft.client_id || null,
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    weekly_frequency: draft.weekly_frequency,
    is_template: draft.is_template,
    sessions: draft.sessions.map(session => ({
      name: session.name.trim(),
      session_type: session.session_type,
      planned_duration_minutes: session.planned_duration_minutes,
      notes: session.notes.trim() || null,
      items: session.items.map(item => {
        if (item.type === 'exercise') {
          return {
            type: 'exercise',
            exercise_id: item.exercise_id,
            substitution_group_id: item.substitution_group_id || null,
            exercise_role: item.exercise_role,
            sets_min: item.sets_min,
            sets_max: item.sets_max,
            reps_min: item.reps_min,
            reps_max: item.reps_max,
            rir_enabled: item.rir_enabled,
            rir_min: item.rir_enabled ? item.rir_min : null,
            rir_max: item.rir_enabled ? item.rir_max : null,
            rest_seconds: item.rest_seconds,
            allow_client_substitution: item.allow_client_substitution,
            substitution_policy: item.substitution_policy,
            notes: item.notes.trim() || null,
            progression_notes: item.progression_notes.trim() || null,
            superset_group: item.superset_group,
            superset_position: item.superset_position,
          }
        }

        return {
          type: 'cardio',
          modality_code: item.modality_code,
          name: item.name.trim() || null,
          duration_minutes: item.duration_minutes,
          target_hr_min: item.target_hr_min,
          target_hr_max: item.target_hr_max,
          target_rpe_min: item.target_rpe_min,
          target_rpe_max: item.target_rpe_max,
          speed_kmh: item.speed_kmh,
          incline_percent: item.incline_percent,
          distance_km: item.distance_km,
          notes: item.notes.trim() || null,
        }
      }),
    })),
  }

  const warmups=draft.sessions.flatMap((session,sessionIndex)=>
    session.items.map((item,itemIndex)=>({item,itemIndex})).flatMap(({item,itemIndex})=>
      item.type==='exercise' ? [{
        day_index:sessionIndex+1,
        sort_order:(itemIndex+1)*10,
        warmup_enabled:item.warmup_enabled,
        warmup_load_percent_min:item.warmup_load_percent_min,
        warmup_load_percent_max:item.warmup_load_percent_max,
        warmup_reps_min:item.warmup_reps_min,
        warmup_reps_max:item.warmup_reps_max,
        warmup_rest_seconds:item.warmup_rest_seconds,
        warmup_notes:item.warmup_notes.trim()||null,
      }] : []
    )
  )

  const {data,error}=await supabase.rpc('create_training_program_with_warmups',{
    p_program:payload,
    p_warmups:warmups,
  })
  if(error) throw error
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
}

export async function loadTrainerPrograms():Promise<TrainerProgramSummary[]> {
  if (!supabase) throw new Error('Supabase не подключён')
  const {data:auth,error:authError}=await supabase.auth.getUser()
  if(authError||!auth.user)throw authError??new Error('Нужно войти как тренер')
  const {data,error}=await supabase.from('training_programs')
    .select('id,name,client_id,status,is_active,is_template,version,weekly_frequency,created_at')
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
