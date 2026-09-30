import { supabase } from '../../lib/supabase'
import { addDaysToDateKey, appDateKey, appStartOfDayIso } from '../../lib/appDate'
import type {
  ActiveTrainingPlan, ExerciseHistoryEntry, LiveCardioEntry, LiveWorkout, LiveWorkoutExercise,
  PreviousSet, WorkoutSchedule, WorkoutSetRecord
} from './types'

export async function loadActiveTrainingPlan(): Promise<ActiveTrainingPlan | null> {
  if (!supabase) throw new Error('Supabase не подключён')

  const { data: program, error } = await supabase
    .from('training_programs')
    .select('id, name, description, weekly_frequency')
    .eq('status', 'active')
    .eq('is_active', true)
    .maybeSingle()

  if (error) throw error
  if (!program) return null

  const { data: sessions, error: sessionsError } = await supabase
    .from('training_days')
    .select('id, name, session_type, planned_duration_minutes, notes, day_index')
    .eq('program_id', program.id)
    .order('day_index')

  if (sessionsError) throw sessionsError

  return {
    id: program.id,
    name: program.name,
    description: program.description,
    weekly_frequency: program.weekly_frequency,
    sessions: (sessions ?? []).map(({day_index:_dayIndex, ...session}) => session),
  }
}



export async function loadMyWorkoutSchedule():Promise<WorkoutSchedule|null>{
  if(!supabase)throw new Error('Supabase не подключён')
  const {data:auth,error:authError}=await supabase.auth.getUser()
  if(authError||!auth.user)throw authError??new Error('Нужно войти')
  const {data,error}=await supabase.from('reminder_rules')
    .select('id,weekdays,local_time,timezone,enabled,settings')
    .eq('client_id',auth.user.id)
    .eq('reminder_type','workout')
    .order('created_at',{ascending:true})
    .limit(1)
    .maybeSingle()
  if(error)throw error
  if(!data)return null
  const settings=(data.settings??{}) as {session_by_weekday?:Record<string,string>}
  return {
    id:data.id,
    weekdays:(data.weekdays??[]).map(Number),
    local_time:String(data.local_time??'18:00:00'),
    timezone:data.timezone??'Europe/Moscow',
    enabled:Boolean(data.enabled),
    session_by_weekday:settings.session_by_weekday??{},
  }
}

export async function saveMyWorkoutSchedule(input:{
  id?:string|null
  weekdays:number[]
  localTime:string
  sessionByWeekday:Record<string,string>
  timezone:string
}):Promise<WorkoutSchedule>{
  if(!supabase)throw new Error('Supabase не подключён')
  const {data:auth,error:authError}=await supabase.auth.getUser()
  if(authError||!auth.user)throw authError??new Error('Нужно войти')

  const payload={
    client_id:auth.user.id,
    module_code:'training',
    reminder_type:'workout',
    name:'Расписание тренировок',
    channel:'in_app',
    channels:['in_app'],
    recipient_mode:'client',
    skip_if_completed:true,
    local_time:input.localTime.length===5?input.localTime+':00':input.localTime,
    weekdays:[...input.weekdays].sort((a,b)=>a-b),
    timezone:input.timezone||'Europe/Moscow',
    enabled:input.weekdays.length>0,
    title_template:'Сегодня тренировка',
    body_template:'По расписанию на сегодня запланирована тренировка. Открой программу, когда будешь готов.',
    action_path:'/workouts',
    settings:{session_by_weekday:input.sessionByWeekday},
    created_by:auth.user.id,
    last_processed_local_date:null,
    updated_at:new Date().toISOString(),
  }

  if(input.id){
    const {data,error}=await supabase.from('reminder_rules')
      .update(payload)
      .eq('id',input.id)
      .eq('client_id',auth.user.id)
      .select('id,weekdays,local_time,timezone,enabled,settings')
      .single()
    if(error)throw error
    const settings=(data.settings??{}) as {session_by_weekday?:Record<string,string>}
    return {id:data.id,weekdays:(data.weekdays??[]).map(Number),local_time:String(data.local_time),timezone:data.timezone,enabled:Boolean(data.enabled),session_by_weekday:settings.session_by_weekday??{}}
  }

  const {data,error}=await supabase.from('reminder_rules')
    .insert(payload)
    .select('id,weekdays,local_time,timezone,enabled,settings')
    .single()
  if(error)throw error
  const settings=(data.settings??{}) as {session_by_weekday?:Record<string,string>}
  return {id:data.id,weekdays:(data.weekdays??[]).map(Number),local_time:String(data.local_time),timezone:data.timezone,enabled:Boolean(data.enabled),session_by_weekday:settings.session_by_weekday??{}}
}

export async function startWorkout(trainingDayId: string): Promise<string> {
  if (!supabase) throw new Error('Supabase не подключён')
  const { data, error } = await supabase.rpc('start_workout', { p_training_day_id: trainingDayId })
  if (error) throw error
  return data as string
}

export async function reopenWorkout(workoutSessionId:string):Promise<string>{
  if(!supabase) throw new Error('Supabase не подключён')
  const {data,error}=await supabase.rpc('reopen_my_workout',{p_workout_session_id:workoutSessionId})
  if(error) throw error
  return data as string
}

export async function loadWorkout(workoutSessionId: string): Promise<LiveWorkout> {
  if (!supabase) throw new Error('Supabase не подключён')
  const db = supabase

  const { data: session, error: sessionError } = await supabase
    .from('workout_sessions')
    .select('id, program_id, training_day_id, started_at, status, active_workout_exercise_id, rest_timer_end_at, rest_timer_name, program_name_snapshot, training_day_name_snapshot, session_type_snapshot')
    .eq('id', workoutSessionId)
    .single()
  if (sessionError) throw sessionError

  const { data: exerciseRows, error: exerciseError } = await supabase
    .from('workout_exercises')
    .select('id, exercise_id, prescribed_exercise_id, prescribed_exercise_name_snapshot, exercise_name_snapshot, instructions_snapshot, technique_url_snapshot, primary_muscle_snapshot, image_storage_path_snapshot, image_external_url_snapshot, sort_order, superset_group, superset_position, prescribed_sets, reps_min, reps_max, rir_min, rir_max, rir_enabled, rest_seconds, allow_substitution, substitution_group_id, substitution_policy, exercise_role, trainer_notes, completed_at, warmup_enabled, warmup_load_percent_min, warmup_load_percent_max, warmup_reps_min, warmup_reps_max, warmup_rest_seconds, warmup_notes')
    .eq('workout_session_id', workoutSessionId)
    .order('sort_order')
  if (exerciseError) throw exerciseError

  const exerciseIds = [...new Set((exerciseRows ?? []).map(row => row.exercise_id))]
  const workoutExerciseIds = (exerciseRows ?? []).map(row => row.id)
  const [exerciseInfoRes, mediaRes, setRes, muscleRes, cardioRes, modalityRes] = await Promise.all([
    exerciseIds.length
      ? supabase.from('exercises').select('id, name, instructions, setup_notes, common_mistakes, technique_url').in('id', exerciseIds)
      : Promise.resolve({data:[],error:null}),
    exerciseIds.length
      ? supabase.from('exercise_media').select('exercise_id, kind, storage_path, external_url, sort_order').in('exercise_id', exerciseIds).order('sort_order')
      : Promise.resolve({data:[],error:null}),
    workoutExerciseIds.length
      ? supabase.from('workout_sets').select('id, workout_exercise_id, set_number, weight_kg, reps, rir, is_warmup, completed_at').in('workout_exercise_id', workoutExerciseIds).order('set_number')
      : Promise.resolve({data:[],error:null}),
    exerciseIds.length
      ? supabase.from('exercise_muscle_groups').select('exercise_id, muscle_group_code, role').in('exercise_id', exerciseIds)
      : Promise.resolve({data:[],error:null}),
    supabase.from('workout_cardio_entries').select('*').eq('workout_session_id', workoutSessionId).order('sort_order'),
    supabase.from('cardio_modalities').select('code, name'),
  ])

  const combinedError = exerciseInfoRes.error || mediaRes.error || setRes.error || muscleRes.error || cardioRes.error || modalityRes.error
  if (combinedError) throw combinedError

  const exerciseInfo = new Map((exerciseInfoRes.data ?? []).map(item => [item.id, item]))
  const exerciseImages = new Map<string,string>()
  const exerciseAnimations = new Map<string,string>()
  const exerciseVideos = new Map<string,string>()
  for (const row of mediaRes.data ?? []) {
    const target=row.kind==='animation'?exerciseAnimations:row.kind==='video'?exerciseVideos:exerciseImages
    if (target.has(row.exercise_id)) continue
    if (row.storage_path) {
      target.set(row.exercise_id,db.storage.from('exercise-media').getPublicUrl(row.storage_path).data.publicUrl)
    } else if (row.external_url) {
      target.set(row.exercise_id,row.external_url)
    }
  }
  const primaryMuscles = new Map(
    (muscleRes.data ?? []).filter(item => item.role === 'primary').map(item => [item.exercise_id, item.muscle_group_code]),
  )
  const setsByExercise = new Map<string, WorkoutSetRecord[]>()
  for (const row of setRes.data ?? []) {
    const list = setsByExercise.get(row.workout_exercise_id) ?? []
    list.push({
      id:row.id,
      set_number:row.set_number,
      weight_kg:row.weight_kg == null ? null : Number(row.weight_kg),
      reps:row.reps,
      rir:row.rir == null ? null : Number(row.rir),
      is_warmup:row.is_warmup,
      completed_at:row.completed_at,
    })
    setsByExercise.set(row.workout_exercise_id,list)
  }

  const allowedSubstitutions = await Promise.all((exerciseRows ?? []).map(async row => {
    if (!row.allow_substitution || !row.substitution_group_id) return [row.id, []] as const
    const { data,error } = await db.rpc('get_allowed_workout_substitutions',{
      p_workout_exercise_id:row.id,
    })
    if (error) throw error
    return [row.id, (data ?? []).map((item:{exercise_id:string;name:string})=>({id:item.exercise_id,name:item.name}))] as const
  }))
  const substitutionsByWorkoutExercise = new Map(allowedSubstitutions)

  const previousResults = await Promise.all((exerciseRows ?? []).map(async row => {
    const [{ data: sets, error: setsError }, { data: recommendation, error: recommendationError }] = await Promise.all([
      db.rpc('get_previous_exercise_sets', {
        p_exercise_id: row.exercise_id,
        p_before: session.started_at,
      }),
      db.rpc('get_workout_load_recommendation', { p_workout_exercise_id: row.id }),
    ])
    if (setsError || recommendationError) throw setsError || recommendationError
    return [row.id, {
      sets: (sets ?? []) as PreviousSet[],
      recommendation: recommendation as LiveWorkoutExercise['load_recommendation'],
    }] as const
  }))
  const previousByWorkoutExercise = new Map(previousResults)

  const exercises: LiveWorkoutExercise[] = (exerciseRows ?? []).map(row => {
    const info = exerciseInfo.get(row.exercise_id)
    return {
      id:row.id,
      exercise_id:row.exercise_id,
      name:row.exercise_name_snapshot ?? info?.name ?? 'Упражнение',
      instructions:row.instructions_snapshot ?? info?.instructions ?? null,
      setup_notes:info?.setup_notes ?? null,
      common_mistakes:info?.common_mistakes ?? null,
      technique_url:row.technique_url_snapshot ?? info?.technique_url ?? null,
      image_url:row.image_storage_path_snapshot
        ? db.storage.from('exercise-media').getPublicUrl(row.image_storage_path_snapshot).data.publicUrl
        : row.image_external_url_snapshot ?? exerciseImages.get(row.exercise_id) ?? null,
      animation_url:exerciseAnimations.get(row.exercise_id) ?? null,
      video_url:exerciseVideos.get(row.exercise_id) ?? null,
      primary_muscle:row.primary_muscle_snapshot ?? primaryMuscles.get(row.exercise_id) ?? null,
      sort_order:row.sort_order,
      superset_group:row.superset_group,
      superset_position:row.superset_position,
      prescribed_sets:row.prescribed_sets ?? 3,
      reps_min:row.reps_min,
      reps_max:row.reps_max,
      rir_min:row.rir_min == null ? null : Number(row.rir_min),
      rir_max:row.rir_max == null ? null : Number(row.rir_max),
      rir_enabled:row.rir_enabled,
      rest_seconds:row.rest_seconds,
      warmup_enabled:row.warmup_enabled,
      warmup_load_percent_min:Number(row.warmup_load_percent_min ?? 50),
      warmup_load_percent_max:Number(row.warmup_load_percent_max ?? 60),
      warmup_reps_min:row.warmup_reps_min ?? 8,
      warmup_reps_max:row.warmup_reps_max ?? 10,
      warmup_rest_seconds:row.warmup_rest_seconds ?? 60,
      warmup_notes:row.warmup_notes,
      allow_substitution:row.allow_substitution,
      substitution_group_id:row.substitution_group_id,
      substitution_policy:row.substitution_policy,
      exercise_role:row.exercise_role,
      trainer_notes:row.trainer_notes,
      completed_at:row.completed_at,
      sets:setsByExercise.get(row.id) ?? [],
      previous_sets:previousByWorkoutExercise.get(row.id)?.sets ?? [],
      load_recommendation:previousByWorkoutExercise.get(row.id)?.recommendation ?? null,
      substitution_options:substitutionsByWorkoutExercise.get(row.id) ?? [],
    }
  })

  const modalityNames = new Map((modalityRes.data ?? []).map(item=>[item.code,item.name]))
  const cardio: LiveCardioEntry[] = (cardioRes.data ?? []).map(row => ({
    id:row.id,
    modality_code:row.modality_code,
    modality_name:modalityNames.get(row.modality_code) ?? row.modality_code,
    name:row.name,
    sort_order:row.sort_order,
    prescribed_duration_minutes:row.prescribed_duration_minutes,
    prescribed_hr_min:row.prescribed_hr_min,
    prescribed_hr_max:row.prescribed_hr_max,
    prescribed_speed_kmh:row.prescribed_speed_kmh == null ? null : Number(row.prescribed_speed_kmh),
    prescribed_incline_percent:row.prescribed_incline_percent == null ? null : Number(row.prescribed_incline_percent),
    prescribed_distance_km:row.prescribed_distance_km == null ? null : Number(row.prescribed_distance_km),
    trainer_notes:row.trainer_notes,
    actual_duration_minutes:row.actual_duration_minutes,
    actual_hr_avg:row.actual_hr_avg,
    actual_rpe:row.actual_rpe == null ? null : Number(row.actual_rpe),
    actual_distance_km:row.actual_distance_km == null ? null : Number(row.actual_distance_km),
    client_notes:row.client_notes,
    completed_at:row.completed_at,
  }))

  return {
    id:session.id,
    training_day_id:session.training_day_id,
    program_name:session.program_name_snapshot ?? 'Программа',
    session_name:session.training_day_name_snapshot ?? 'Тренировка',
    session_type:session.session_type_snapshot ?? 'strength',
    started_at:session.started_at,
    status:session.status,
    active_workout_exercise_id:session.active_workout_exercise_id,
    rest_timer_end_at:session.rest_timer_end_at,
    rest_timer_name:session.rest_timer_name,
    exercises,
    cardio,
  }
}

export async function loadInProgressWorkout(): Promise<LiveWorkout | null> {
  if (!supabase) throw new Error('Supabase не подключён')
  const { data, error } = await supabase
    .from('workout_sessions')
    .select('id')
    .eq('status','in_progress')
    .order('started_at',{ascending:false})
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data ? loadWorkout(data.id) : null
}

export async function loadLatestCompletedWorkoutToday(): Promise<LiveWorkout | null> {
  if (!supabase) throw new Error('Supabase не подключён')
  const today=appDateKey()
  const start=appStartOfDayIso(today)
  const end=appStartOfDayIso(addDaysToDateKey(today,1))
  const { data, error } = await supabase
    .from('workout_sessions')
    .select('id')
    .eq('status','completed')
    .gte('completed_at',start)
    .lt('completed_at',end)
    .order('completed_at',{ascending:false})
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data ? loadWorkout(data.id) : null
}

export async function reopenWorkoutExercise(workoutExerciseId:string) {
  if (!supabase) throw new Error('Supabase не подключён')
  const { error } = await supabase
    .from('workout_exercises')
    .update({completed_at:null})
    .eq('id',workoutExerciseId)
    .select('id')
    .single()
  if (error) throw error
}

export async function completeWorkoutExercise(workoutExerciseId:string,completedAt:string|null=new Date().toISOString()) {
  if (!supabase) throw new Error('Supabase не подключён')
  const { error } = await supabase
    .from('workout_exercises')
    .update({completed_at:completedAt})
    .eq('id',workoutExerciseId)
    .select('id')
    .single()
  if (error) throw error
}

export async function saveWorkoutSet(
  workoutExerciseId:string,
  set:WorkoutSetRecord,
): Promise<WorkoutSetRecord> {
  if (!supabase) throw new Error('Supabase не подключён')

  const payload = {
    workout_exercise_id:workoutExerciseId,
    set_number:set.set_number,
    weight_kg:set.weight_kg,
    reps:set.reps,
    rir:set.rir,
    is_warmup:set.is_warmup,
    completed_at:set.completed_at,
  }

  const { data, error } = await supabase.rpc('save_workout_set', {
    p_workout_exercise_id: payload.workout_exercise_id,
    p_set_number: payload.set_number,
    p_weight_kg: payload.weight_kg,
    p_reps: payload.reps,
    p_rir: payload.rir,
    p_is_warmup: payload.is_warmup,
    p_completed_at: payload.completed_at,
  })

  if (error) throw error
  return {
    id:data.id,
    set_number:data.set_number,
    weight_kg:data.weight_kg == null ? null : Number(data.weight_kg),
    reps:data.reps,
    rir:data.rir == null ? null : Number(data.rir),
    is_warmup:data.is_warmup,
    completed_at:data.completed_at,
  }
}

export async function deleteWorkoutSet(workoutExerciseId:string,setNumber:number) {
  if (!supabase) throw new Error('Supabase не подключён')
  const { error } = await supabase
    .from('workout_sets')
    .delete()
    .eq('workout_exercise_id',workoutExerciseId)
    .eq('set_number',setNumber)
  if (error) throw error
}

export async function replaceWorkoutExercise(workoutExerciseId:string,newExerciseId:string) {
  if (!supabase) throw new Error('Supabase не подключён')
  const { error } = await supabase.rpc('replace_workout_exercise',{
    p_workout_exercise_id:workoutExerciseId,
    p_new_exercise_id:newExerciseId,
  })
  if (error) throw error
}

export async function addWorkoutComment(workoutExerciseId:string,body:string) {
  if (!supabase) throw new Error('Supabase не подключён')
  const { data,error } = await supabase.rpc('add_workout_comment',{
    p_workout_exercise_id:workoutExerciseId,
    p_body:body,
  })
  if (error) throw error
  return data as string
}

export async function completeCardioEntry(id:string, values:{
  actual_duration_minutes:number|null
  actual_hr_avg:number|null
  actual_rpe:number|null
  actual_distance_km:number|null
  client_notes:string|null
}) {
  if (!supabase) throw new Error('Supabase не подключён')
  const { error } = await supabase
    .from('workout_cardio_entries')
    .update({...values,completed_at:new Date().toISOString()})
    .eq('id',id)
    .select('id')
    .single()
  if (error) throw error
}

export async function completeWorkout(id:string,comment?:string) {
  if (!supabase) throw new Error('Supabase не подключён')
  const { error } = await supabase.rpc('complete_workout',{
    p_workout_session_id:id,
    p_comment:comment?.trim() || null,
  })
  if (error) throw error
}


export async function loadExerciseHistory(exerciseId:string,limit=12):Promise<ExerciseHistoryEntry[]> {
  if (!supabase) throw new Error('Supabase не подключён')
  const {data,error}=await supabase.rpc('get_my_exercise_history',{
    p_exercise_id:exerciseId,
    p_limit:limit,
  })
  if(error) throw error
  return (data??[]).map((row:{
    workout_session_id:string
    workout_date:string
    completed_at:string|null
    sets:WorkoutSetRecord[]|null
  })=>({
    workout_session_id:row.workout_session_id,
    workout_date:row.workout_date,
    completed_at:row.completed_at,
    sets:(row.sets??[]).map(set=>({
      ...set,
      weight_kg:set.weight_kg==null?null:Number(set.weight_kg),
      rir:set.rir==null?null:Number(set.rir),
    })),
  }))
}

export async function saveWorkoutUiState(workoutSessionId:string,activeWorkoutExerciseId:string|null,restTimerEndAt:string|null,restTimerName:string|null){
  if(!supabase) throw new Error('Supabase не подключён')
  const {error}=await supabase.rpc('save_workout_ui_state',{p_workout_session_id:workoutSessionId,p_active_workout_exercise_id:activeWorkoutExerciseId,p_rest_timer_end_at:restTimerEndAt,p_rest_timer_name:restTimerName??''})
  if(error) throw error
}

export type WorkoutHistorySummary={id:string;training_day_id:string|null;name:string;program_name:string;started_at:string;completed_at:string|null;session_type:string}
export async function loadWorkoutHistory(limit=20):Promise<WorkoutHistorySummary[]>{
  if(!supabase)throw new Error('Supabase не подключён')
  const {data,error}=await supabase.from('workout_sessions').select('id,training_day_id,started_at,completed_at,program_name_snapshot,training_day_name_snapshot,session_type_snapshot').eq('status','completed').order('completed_at',{ascending:false}).limit(limit)
  if(error)throw error
  return (data??[]).map(row=>({id:row.id,training_day_id:row.training_day_id,name:row.training_day_name_snapshot??'Тренировка',program_name:row.program_name_snapshot??'Программа',started_at:row.started_at,completed_at:row.completed_at,session_type:row.session_type_snapshot??'strength'}))
}
