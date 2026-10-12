import { supabase } from '../../lib/supabase'

export type TrainerClientTargets={
  id:string|null
  valid_from:string
  calories_target:number|null
  calorie_tolerance:number
  protein_target_g:number|null
  fat_min_g:number|null
  fat_max_g:number|null
  carbs_target_g:number|null
}

export type TrainerClientJournal={
  targets:TrainerClientTargets|null
  daily:Array<{
    checkin_date:string
    calories:number|null
    protein_g:number|null
    fat_g:number|null
    carbs_g:number|null
    steps:number|null
    trained:boolean|null
    hunger:number|null
    energy:number|null
    stress:number|null
    sleep:number|null
    ease:number|null
    comment:string|null
  }>
  measurements:Array<{
    measured_at:string
    weight_kg:number|null
    waist_cm:number|null
    chest_cm:number|null
    hips_cm:number|null
    thigh_cm:number|null
    arm_relaxed_cm:number|null
    arm_flexed_cm:number|null
    note:string|null
  }>
  monthly:Array<{
    checkin_date:string
    appearance:number|null
    fitness:number|null
    physical_comfort:number|null
    energy:number|null
    sleep_recovery:number|null
    nutrition:number|null
    relationship_with_food:number|null
    improve:string|null
    next_step:string|null
    keep:string|null
    comment:string|null
  }>
}

const n=(value:unknown)=>value==null?null:Number(value)

export async function loadTrainerClientJournal(clientId:string):Promise<TrainerClientJournal>{
  if(!supabase)throw new Error('Supabase не подключён')
  const [targetResult,dailyResult,measurementResult,monthlyResult]=await Promise.all([
    supabase.from('client_targets')
      .select('id,valid_from,calories_target,calorie_tolerance,protein_target_g,fat_min_g,fat_max_g,carbs_target_g')
      .eq('client_id',clientId).order('valid_from',{ascending:false}).limit(1).maybeSingle(),
    supabase.from('daily_checkins')
      .select('checkin_date,calories,protein_g,fat_g,carbs_g,steps,trained,hunger,energy,stress,sleep,ease,comment')
      .eq('client_id',clientId).order('checkin_date',{ascending:false}).limit(14),
    supabase.from('measurements')
      .select('measured_at,weight_kg,waist_cm,chest_cm,hips_cm,thigh_cm,arm_relaxed_cm,arm_flexed_cm,note')
      .eq('client_id',clientId).order('measured_at',{ascending:false}).limit(14),
    supabase.from('monthly_checkins')
      .select('checkin_date,appearance,fitness,physical_comfort,energy,sleep_recovery,nutrition,relationship_with_food,improve,next_step,keep,comment')
      .eq('client_id',clientId).order('checkin_date',{ascending:false}).limit(6),
  ])
  if(targetResult.error)throw targetResult.error
  if(dailyResult.error)throw dailyResult.error
  if(measurementResult.error)throw measurementResult.error
  if(monthlyResult.error)throw monthlyResult.error
  const t=targetResult.data
  return {
    targets:t?{
      id:t.id,valid_from:t.valid_from,calories_target:t.calories_target,
      calorie_tolerance:Number(t.calorie_tolerance??100),protein_target_g:n(t.protein_target_g),
      fat_min_g:n(t.fat_min_g),fat_max_g:n(t.fat_max_g),carbs_target_g:n(t.carbs_target_g),
    }:null,
    daily:(dailyResult.data??[]).map(row=>({...row,protein_g:n(row.protein_g),fat_g:n(row.fat_g),carbs_g:n(row.carbs_g)})),
    measurements:(measurementResult.data??[]).map(row=>({...row,weight_kg:n(row.weight_kg),waist_cm:n(row.waist_cm),chest_cm:n(row.chest_cm),hips_cm:n(row.hips_cm),thigh_cm:n(row.thigh_cm),arm_relaxed_cm:n(row.arm_relaxed_cm),arm_flexed_cm:n(row.arm_flexed_cm)})),
    monthly:(monthlyResult.data??[]) as TrainerClientJournal['monthly'],
  }
}

export async function saveTrainerClientTargets(
  clientId:string,
  input:Omit<TrainerClientTargets,'id'|'valid_from'>,
  existing?:TrainerClientTargets|null,
):Promise<TrainerClientTargets>{
  if(!supabase)throw new Error('Supabase не подключён')
  const {data:auth,error:authError}=await supabase.auth.getUser()
  if(authError||!auth.user)throw authError??new Error('Нужно войти')
  const validFrom=existing?.valid_from??new Date().toISOString().slice(0,10)
  const payload={
    client_id:clientId,valid_from:validFrom,
    calories_target:input.calories_target,calorie_tolerance:input.calorie_tolerance,
    protein_target_g:input.protein_target_g,fat_min_g:input.fat_min_g,fat_max_g:input.fat_max_g,
    carbs_target_g:input.carbs_target_g,created_by:auth.user.id,
  }
  const {data,error}=await supabase.from('client_targets').upsert(payload,{onConflict:'client_id,valid_from'})
    .select('id,valid_from,calories_target,calorie_tolerance,protein_target_g,fat_min_g,fat_max_g,carbs_target_g').single()
  if(error)throw error
  return {
    id:data.id,valid_from:data.valid_from,calories_target:data.calories_target,
    calorie_tolerance:Number(data.calorie_tolerance??100),protein_target_g:n(data.protein_target_g),
    fat_min_g:n(data.fat_min_g),fat_max_g:n(data.fat_max_g),carbs_target_g:n(data.carbs_target_g),
  }
}
