import { supabase } from '../../lib/supabase'
import { addDaysToDateKey, appDateKey, appIsoWeekday, appStartOfDayIso, appWeekStartDateKey } from '../../lib/appDate'

export type TrackingFieldState={
  code:string
  section:string
  label:string
  unit:string|null
  enabled:boolean
  required:boolean
  frequency:string|null
  client_can_disable:boolean
  hidden:boolean
  reminder_enabled:boolean
  settings:Record<string,unknown>
}

export type DailyWellbeing={
  hunger:number|null
  energy:number|null
  stress:number|null
  sleep:number|null
  ease:number|null
  comment:string
}

export type Measurement={
  id:string
  measured_at:string
  weight_kg:number|null
  waist_cm:number|null
  chest_cm:number|null
  hips_cm:number|null
  thigh_cm:number|null
  arm_relaxed_cm:number|null
  arm_flexed_cm:number|null
  note:string|null
}

export type MonthlyCheckin={
  appearance:number|null
  fitness:number|null
  physical_comfort:number|null
  energy:number|null
  sleep_recovery:number|null
  nutrition:number|null
  relationship_with_food:number|null
  improve:string
  next_step:string
  keep:string
  comment:string
}

export type TodayTask={
  id:string
  type:string
  name:string
  time:string
  action_path:string|null
  completed:boolean
}

function num(value:unknown){return value==null?null:Number(value)}
function today(){return appDateKey()}
function monthKey(){return today().slice(0,7)}

export async function loadMyTrackingSetup():Promise<TrackingFieldState[]>{
  if(!supabase)throw new Error('Supabase не подключён')
  const {data:auth,error:authError}=await supabase.auth.getUser()
  if(authError||!auth.user)throw authError??new Error('Нужно войти')
  const uid=auth.user.id

  const [{data:fields,error:fieldError},{data:config,error:configError},{data:prefs,error:prefError}]=await Promise.all([
    supabase.from('tracking_fields').select('code,section,label,unit,default_enabled,default_required,client_can_disable,sort_order').order('section').order('sort_order'),
    supabase.from('client_tracking_config').select('field_code,enabled,required,frequency,settings').eq('client_id',uid),
    supabase.from('client_tracking_preferences').select('field_code,hidden,reminder_enabled').eq('client_id',uid),
  ])
  if(fieldError)throw fieldError
  if(configError)throw configError
  if(prefError)throw prefError

  const configMap=new Map((config??[]).map(x=>[x.field_code,x]))
  const prefMap=new Map((prefs??[]).map(x=>[x.field_code,x]))

  return (fields??[]).map(f=>{
    const c=configMap.get(f.code)
    const p=prefMap.get(f.code)
    return {
      code:f.code,section:f.section,label:f.label,unit:f.unit,
      enabled:c?.enabled??f.default_enabled,
      required:c?.required??f.default_required,
      frequency:c?.frequency??null,
      client_can_disable:f.client_can_disable,
      hidden:Boolean(p?.hidden),
      reminder_enabled:p?.reminder_enabled??true,
      settings:(c?.settings??{}) as Record<string,unknown>,
    }
  })
}

export async function setMyTrackingPreference(fieldCode:string,hidden:boolean){
  if(!supabase)throw new Error('Supabase не подключён')
  const {data:auth,error:authError}=await supabase.auth.getUser()
  if(authError||!auth.user)throw authError??new Error('Нужно войти')
  const {error}=await supabase.from('client_tracking_preferences').upsert({
    client_id:auth.user.id,field_code:fieldCode,hidden,updated_at:new Date().toISOString(),
  },{onConflict:'client_id,field_code'})
  if(error)throw error
}

export async function loadTodayWellbeing():Promise<DailyWellbeing>{
  if(!supabase)throw new Error('Supabase не подключён')
  const {data:auth,error:authError}=await supabase.auth.getUser()
  if(authError||!auth.user)throw authError??new Error('Нужно войти')
  const {data,error}=await supabase.from('daily_checkins')
    .select('hunger,energy,stress,sleep,ease,comment')
    .eq('client_id',auth.user.id).eq('checkin_date',today()).maybeSingle()
  if(error)throw error
  return {
    hunger:data?.hunger??null,energy:data?.energy??null,stress:data?.stress??null,
    sleep:data?.sleep??null,ease:data?.ease??null,comment:data?.comment??'',
  }
}

export async function saveTodayWellbeing(input:DailyWellbeing){
  if(!supabase)throw new Error('Supabase не подключён')
  const {error}=await supabase.rpc('save_my_wellbeing_checkin',{
    p_date:today(),p_hunger:input.hunger,p_energy:input.energy,p_stress:input.stress,
    p_sleep:input.sleep,p_ease:input.ease,p_comment:input.comment||null,
  })
  if(error)throw error
}

export async function loadMeasurements(limit=90):Promise<Measurement[]>{
  if(!supabase)throw new Error('Supabase не подключён')
  const {data:auth,error:authError}=await supabase.auth.getUser()
  if(authError||!auth.user)throw authError??new Error('Нужно войти')
  const {data,error}=await supabase.from('measurements')
    .select('id,measured_at,weight_kg,waist_cm,chest_cm,hips_cm,thigh_cm,arm_relaxed_cm,arm_flexed_cm,note')
    .eq('client_id',auth.user.id).order('measured_at',{ascending:false}).limit(limit)
  if(error)throw error
  return (data??[]).map(x=>({
    ...x,weight_kg:num(x.weight_kg),waist_cm:num(x.waist_cm),chest_cm:num(x.chest_cm),
    hips_cm:num(x.hips_cm),thigh_cm:num(x.thigh_cm),arm_relaxed_cm:num(x.arm_relaxed_cm),
    arm_flexed_cm:num(x.arm_flexed_cm),
  }))
}

export async function saveMeasurement(input:Omit<Measurement,'id'>){
  if(!supabase)throw new Error('Supabase не подключён')
  const {error}=await supabase.rpc('save_my_measurement',{
    p_date:input.measured_at,p_weight_kg:input.weight_kg,p_waist_cm:input.waist_cm,
    p_chest_cm:input.chest_cm,p_hips_cm:input.hips_cm,p_thigh_cm:input.thigh_cm,
    p_arm_relaxed_cm:input.arm_relaxed_cm,p_arm_flexed_cm:input.arm_flexed_cm,
    p_note:input.note||null,
  })
  if(error)throw error
}

export async function loadCurrentMonthCheckin():Promise<MonthlyCheckin>{
  if(!supabase)throw new Error('Supabase не подключён')
  const {data:auth,error:authError}=await supabase.auth.getUser()
  if(authError||!auth.user)throw authError??new Error('Нужно войти')
  const first=monthKey()+'-01'
  const {data,error}=await supabase.from('monthly_checkins')
    .select('appearance,fitness,physical_comfort,energy,sleep_recovery,nutrition,relationship_with_food,improve,next_step,keep,comment')
    .eq('client_id',auth.user.id).eq('checkin_date',first).maybeSingle()
  if(error)throw error
  return {
    appearance:data?.appearance??null,fitness:data?.fitness??null,
    physical_comfort:data?.physical_comfort??null,energy:data?.energy??null,
    sleep_recovery:data?.sleep_recovery??null,nutrition:data?.nutrition??null,
    relationship_with_food:data?.relationship_with_food??null,
    improve:data?.improve??'',next_step:data?.next_step??'',keep:data?.keep??'',comment:data?.comment??'',
  }
}

export async function saveCurrentMonthCheckin(input:MonthlyCheckin){
  if(!supabase)throw new Error('Supabase не подключён')
  const {error}=await supabase.rpc('save_my_monthly_checkin',{
    p_date:today(),p_appearance:input.appearance,p_fitness:input.fitness,
    p_physical_comfort:input.physical_comfort,p_energy:input.energy,
    p_sleep_recovery:input.sleep_recovery,p_nutrition:input.nutrition,
    p_relationship_with_food:input.relationship_with_food,p_improve:input.improve||null,
    p_next_step:input.next_step||null,p_keep:input.keep||null,p_comment:input.comment||null,
  })
  if(error)throw error
}

export async function isProgressPhotoDone():Promise<boolean>{
  if(!supabase)return false
  const {data:auth}=await supabase.auth.getUser()
  if(!auth.user)return false
  const {data,error}=await supabase.from('client_task_completions')
    .select('id').eq('client_id',auth.user.id).eq('task_type','progress_photo').eq('period_key',monthKey()).maybeSingle()
  if(error)throw error
  return Boolean(data)
}

export async function setProgressPhotoDone(done:boolean){
  if(!supabase)throw new Error('Supabase не подключён')
  if(done){
    const {error}=await supabase.rpc('mark_my_task_complete',{p_task_type:'progress_photo'})
    if(error)throw error
    return
  }
  const {data:auth,error:authError}=await supabase.auth.getUser()
  if(authError||!auth.user)throw authError??new Error('Нужно войти')
  const {error}=await supabase.from('client_task_completions').delete()
    .eq('client_id',auth.user.id).eq('task_type','progress_photo').eq('period_key',monthKey())
  if(error)throw error
}

export async function loadTodayTasks():Promise<TodayTask[]>{
  if(!supabase)return []
  const {data:auth,error:authError}=await supabase.auth.getUser()
  if(authError||!auth.user)throw authError??new Error('Нужно войти')
  const uid=auth.user.id
  const date=today()
  const isoDay=appIsoWeekday(date)
  const dayOfMonth=Number(date.slice(8,10))
  const nextDate=addDaysToDateKey(date,1)

  const [{data:rules,error:ruleError},{data:modules,error:moduleError},{data:measurement},{data:monthMeasurements},{data:checkin},{data:monthly},{data:photo},{data:workouts}]=await Promise.all([
    supabase.from('reminder_rules').select('id,module_code,reminder_type,name,local_time,weekdays,settings,action_path').eq('client_id',uid).eq('enabled',true),
    supabase.from('client_modules').select('module_code,enabled,starts_at,ends_at').eq('client_id',uid),
    supabase.from('measurements').select('weight_kg,waist_cm,chest_cm,hips_cm,thigh_cm,arm_relaxed_cm,arm_flexed_cm').eq('client_id',uid).eq('measured_at',date).maybeSingle(),
    supabase.from('measurements').select('chest_cm,hips_cm,thigh_cm,arm_relaxed_cm,arm_flexed_cm').eq('client_id',uid).gte('measured_at',monthKey()+'-01').lte('measured_at',date),
    supabase.from('daily_checkins').select('nutrition_adherence,nutrition_deviation,calories,protein_g,hunger,energy,stress,sleep,ease,comment').eq('client_id',uid).eq('checkin_date',date).maybeSingle(),
    supabase.from('monthly_checkins').select('id').eq('client_id',uid).eq('checkin_date',monthKey()+'-01').maybeSingle(),
    supabase.from('client_task_completions').select('id').eq('client_id',uid).eq('task_type','progress_photo').eq('period_key',monthKey()).maybeSingle(),
    supabase.from('workout_sessions').select('id').eq('client_id',uid).eq('status','completed').gte('completed_at',appStartOfDayIso(date)).lt('completed_at',appStartOfDayIso(nextDate)).limit(1),
  ])
  if(ruleError)throw ruleError
  if(moduleError)throw moduleError
  const activeModules=new Set((modules??[]).filter(m=>m.enabled&&m.starts_at<=date&&(!m.ends_at||m.ends_at>=date)).map(m=>m.module_code))

  const completed=(type:string)=>{
    if(type==='weight')return measurement?.weight_kg!=null
    if(type==='waist')return measurement?.waist_cm!=null
    if(type==='nutrition')return Boolean(checkin&&(checkin.nutrition_adherence!=null||checkin.nutrition_deviation!=null||checkin.calories!=null||checkin.protein_g!=null))
    if(type==='daily_checkin')return Boolean(checkin&&(checkin.hunger!=null||checkin.energy!=null||checkin.stress!=null||checkin.sleep!=null||checkin.ease!=null||String(checkin.comment??'').trim()))
    if(type==='monthly_measurements')return Boolean((monthMeasurements??[]).some(m=>m.chest_cm!=null||m.hips_cm!=null||m.thigh_cm!=null||m.arm_relaxed_cm!=null||m.arm_flexed_cm!=null))
    if(type==='monthly_checkin')return Boolean(monthly)
    if(type==='progress_photo')return Boolean(photo)
    if(type==='workout')return Boolean(workouts?.length)
    return false
  }

  return (rules??[]).filter(rule=>{
    if(rule.module_code&&!activeModules.has(rule.module_code))return false
    const days=(rule.weekdays??[]) as number[]
    if(days.length&& !days.includes(isoDay))return false
    const settings=(rule.settings??{}) as Record<string,unknown>
    if(settings.period==='monthly'&&dayOfMonth>7)return false
    return true
  }).map(rule=>({
    id:rule.id,type:rule.reminder_type,name:rule.name??'Задача',
    time:String(rule.local_time).slice(0,5),action_path:rule.action_path,
    completed:completed(rule.reminder_type),
  })).sort((a,b)=>a.time.localeCompare(b.time))
}


export type DashboardSnapshot={
  weight:number|null
  waist:number|null
  workouts_this_week:number
  nutrition_days_this_week:number
}

export async function loadDashboardSnapshot():Promise<DashboardSnapshot>{
  if(!supabase)throw new Error('Supabase не подключён')
  const {data:auth,error:authError}=await supabase.auth.getUser()
  if(authError||!auth.user)throw authError??new Error('Нужно войти')
  const uid=auth.user.id
  const mondayDate=appWeekStartDateKey(today())
  const monday=appStartOfDayIso(mondayDate)

  const [
    {data:weight,error:weightError},
    {data:waist,error:waistError},
    {count:workouts,error:workoutError},
    {data:nutrition,error:nutritionError},
  ]=await Promise.all([
    supabase.from('measurements').select('weight_kg').eq('client_id',uid).not('weight_kg','is',null).order('measured_at',{ascending:false}).limit(1).maybeSingle(),
    supabase.from('measurements').select('waist_cm').eq('client_id',uid).not('waist_cm','is',null).order('measured_at',{ascending:false}).limit(1).maybeSingle(),
    supabase.from('workout_sessions').select('id',{count:'exact',head:true}).eq('client_id',uid).eq('status','completed').gte('completed_at',monday),
    supabase.from('daily_checkins').select('checkin_date,nutrition_adherence,nutrition_deviation,calories,protein_g')
      .eq('client_id',uid).gte('checkin_date',mondayDate).lte('checkin_date',today()),
  ])
  if(weightError)throw weightError
  if(waistError)throw waistError
  if(workoutError)throw workoutError
  if(nutritionError)throw nutritionError

  const nutritionDays=(nutrition??[]).filter(x=>x.nutrition_adherence!=null||x.nutrition_deviation!=null||x.calories!=null||x.protein_g!=null).length
  return {
    weight:num(weight?.weight_kg),
    waist:num(waist?.waist_cm),
    workouts_this_week:workouts??0,
    nutrition_days_this_week:nutritionDays,
  }
}
