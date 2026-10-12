import { getVerifiedUser, supabase } from '../../lib/supabase'
import { appDateKey } from '../../lib/appDate'
import type {
  ActiveNutritionMeal, ActiveNutritionPlan, NutritionBuilderReferences, NutritionDailyCheckin, NutritionFood,
  NutritionMealDraft, NutritionMealItemDraft, NutritionPlanDraft, SavedMeal
} from './types'

function num(value:unknown) {
  return value == null ? 0 : Number(value)
}

export async function loadNutritionBuilderReferences():Promise<NutritionBuilderReferences> {
  if (!supabase) throw new Error('Supabase не подключён')
  const [authUser,{data:foods,error:foodError}] = await Promise.all([
    getVerifiedUser(),
    supabase.from('foods').select('id,name,kcal_100,protein_100,fat_100,carbs_100,default_portion_g').eq('is_active',true).order('name'),
  ])
  if (foodError) throw foodError

  const {data:relations,error:relationError}=await supabase
    .from('coach_clients').select('client_id')
    .eq('coach_id',authUser.id).eq('status','active')
  if (relationError) throw relationError

  const ids=(relations??[]).map(x=>x.client_id)
  let clients:NutritionBuilderReferences['clients']=[]
  if(ids.length){
    const {data,error}=await supabase.from('profiles').select('id,display_name').in('id',ids).order('display_name')
    if(error) throw error
    clients=(data??[]).map(x=>({id:x.id,name:x.display_name}))
  }

  return {
    clients,
    foods:(foods??[]).map(f=>({
      id:f.id,name:f.name,kcal_100:num(f.kcal_100),protein_100:num(f.protein_100),
      fat_100:num(f.fat_100),carbs_100:num(f.carbs_100),
      default_portion_g:f.default_portion_g==null?null:num(f.default_portion_g),
    })),
  }
}

export async function createNutritionFood(input:Omit<NutritionFood,'id'> & {food_group:string}):Promise<NutritionFood>{
  if(!supabase) throw new Error('Supabase не подключён')
  const authUser=await getVerifiedUser()
  const {data,error}=await supabase.from('foods').insert({
    name:input.name.trim(),kcal_100:input.kcal_100,protein_100:input.protein_100,
    fat_100:input.fat_100,carbs_100:input.carbs_100,
    default_portion_g:input.default_portion_g,food_group:input.food_group,created_by:authUser.id,
  }).select('id,name,kcal_100,protein_100,fat_100,carbs_100,default_portion_g').single()
  if(error) throw error
  return {
    id:data.id,name:data.name,kcal_100:num(data.kcal_100),protein_100:num(data.protein_100),
    fat_100:num(data.fat_100),carbs_100:num(data.carbs_100),
    default_portion_g:data.default_portion_g==null?null:num(data.default_portion_g),
  }
}

function itemPayload(item:NutritionMealItemDraft){
  return {
    food_id:item.food_id,
    name:item.name,
    grams:item.grams,
    kcal_100:item.kcal_100,
    protein_100:item.protein_100,
    fat_100:item.fat_100,
    carbs_100:item.carbs_100,
    is_fixed:item.is_fixed,
    notes:item.notes||null,
  }
}

function sameNullableNumber(a:number|null|undefined,b:number|null|undefined){
  return (a??null)===(b??null)
}

export function sameNutritionFoodDetails(actual:NutritionFood,expected:NutritionFood){
  return actual.id===expected.id
    && actual.source===expected.source
    && actual.name.trim()===expected.name.trim()
    && actual.kcal_100===expected.kcal_100
    && actual.protein_100===expected.protein_100
    && actual.fat_100===expected.fat_100
    && actual.carbs_100===expected.carbs_100
    && sameNullableNumber(actual.default_portion_g,expected.default_portion_g)
}

export function savedMealMatchesInput(
  meal:SavedMeal,
  name:string,
  mealType:'main'|'light'|'snack',
  items:NutritionMealItemDraft[]
){
  if(meal.name!==name.trim()||meal.meal_type!==mealType||meal.items.length!==items.length)return false
  return meal.items.every((actual,index)=>{
    const expected=items[index]
    return actual.food_id===expected.food_id
      && (actual.client_food_id??null)===(expected.client_food_id??null)
      && actual.name.trim()===expected.name.trim()
      && actual.grams===expected.grams
      && actual.kcal_100===expected.kcal_100
      && actual.protein_100===expected.protein_100
      && actual.fat_100===expected.fat_100
      && actual.carbs_100===expected.carbs_100
      && actual.is_fixed===expected.is_fixed
  })
}

export async function loadNutritionPlanDraft(planId:string):Promise<NutritionPlanDraft>{
  if(!supabase)throw new Error('Supabase не подключён')
  const {data:plan,error}=await supabase.from('nutrition_plans')
    .select('id,client_id,name,description,daily_kcal_target,protein_target_g,fat_target_g,carbs_target_g,notes,status')
    .eq('id',planId)
    .eq('status','draft')
    .single()
  if(error)throw error

  const {data:meals,error:mealError}=await supabase.from('nutrition_plan_meals')
    .select('id,name,meal_type,kcal_target,target_locked,notes,sort_order')
    .eq('plan_id',planId)
    .order('sort_order')
  if(mealError)throw mealError

  const mealIds=(meals??[]).map(row=>row.id)
  const {data:variants,error:variantError}=mealIds.length
    ? await supabase.from('nutrition_plan_meal_variants')
      .select('id,meal_id,name,is_default,notes,sort_order')
      .in('meal_id',mealIds).order('sort_order')
    : {data:[],error:null}
  if(variantError)throw variantError

  const variantIds=(variants??[]).map(row=>row.id)
  const {data:items,error:itemError}=variantIds.length
    ? await supabase.from('nutrition_plan_meal_items')
      .select('id,variant_id,food_id,client_food_id,food_name_snapshot,grams,kcal_100_snapshot,protein_100_snapshot,fat_100_snapshot,carbs_100_snapshot,is_fixed,notes,sort_order')
      .in('variant_id',variantIds).order('sort_order')
    : {data:[],error:null}
  if(itemError)throw itemError

  return {
    id:plan.id,
    client_id:plan.client_id??'',
    name:plan.name,
    description:plan.description??'',
    daily_kcal_target:num(plan.daily_kcal_target),
    protein_target_g:plan.protein_target_g==null?null:num(plan.protein_target_g),
    fat_target_g:plan.fat_target_g==null?null:num(plan.fat_target_g),
    carbs_target_g:plan.carbs_target_g==null?null:num(plan.carbs_target_g),
    notes:plan.notes??'',
    meals:(meals??[]).map(meal=>({
      local_id:meal.id,
      name:meal.name,
      meal_type:meal.meal_type as NutritionMealDraft['meal_type'],
      kcal_target:num(meal.kcal_target),
      target_locked:Boolean(meal.target_locked),
      notes:meal.notes??'',
      variants:(variants??[]).filter(variant=>variant.meal_id===meal.id).map(variant=>({
        local_id:variant.id,
        name:variant.name,
        is_default:Boolean(variant.is_default),
        notes:variant.notes??'',
        items:(items??[]).filter(item=>item.variant_id===variant.id).map(item=>({
          local_id:item.id,
          food_id:item.food_id,
          client_food_id:item.client_food_id,
          name:item.food_name_snapshot,
          grams:num(item.grams),
          kcal_100:num(item.kcal_100_snapshot),
          protein_100:num(item.protein_100_snapshot),
          fat_100:num(item.fat_100_snapshot),
          carbs_100:num(item.carbs_100_snapshot),
          is_fixed:Boolean(item.is_fixed),
          notes:item.notes??'',
        })),
      })),
    })),
  }
}

export async function saveNutritionPlan(draft:NutritionPlanDraft):Promise<string>{
  if(!supabase) throw new Error('Supabase не подключён')
  const payload={
    id:draft.id,
    client_id:draft.client_id||null,
    name:draft.name,
    description:draft.description||null,
    daily_kcal_target:draft.daily_kcal_target,
    protein_target_g:draft.protein_target_g,
    fat_target_g:draft.fat_target_g,
    carbs_target_g:draft.carbs_target_g,
    notes:draft.notes||null,
    meals:draft.meals.map(meal=>({
      name:meal.name,meal_type:meal.meal_type,kcal_target:meal.kcal_target,
      target_locked:meal.target_locked,notes:meal.notes||null,
      variants:meal.variants.map(variant=>({
        name:variant.name,is_default:variant.is_default,notes:variant.notes||null,
        items:variant.items.map(itemPayload),
      })),
    })),
  }
  const {data,error}=await supabase.rpc('save_nutrition_plan',{p_plan:payload})
  if(error) throw error
  return data as string
}

export async function publishNutritionPlan(id:string){
  if(!supabase) throw new Error('Supabase не подключён')
  const {data,error}=await supabase.rpc('publish_nutrition_plan',{p_plan_id:id})
  if(error) throw error
  return data as string
}

export async function saveMealPreset(name:string,mealType:'main'|'light'|'snack',items:NutritionMealItemDraft[]){
  if(!supabase) throw new Error('Supabase не подключён')
  const {data,error}=await supabase.rpc('save_my_meal_preset',{
    p_name:name.trim(),
    p_meal_type:mealType,
    p_items:items.map(item=>({
      food_id:item.food_id,
      client_food_id:item.client_food_id??null,
      name:item.name,
      grams:item.grams,
      kcal_100:item.kcal_100,
      protein_100:item.protein_100,
      fat_100:item.fat_100,
      carbs_100:item.carbs_100,
      is_fixed:item.is_fixed,
    })),
  })
  if(error) throw error
  return data as string
}

export async function archiveSavedMeal(id:string):Promise<void>{
  if(!supabase)throw new Error('Supabase не подключён')
  const authUser=await getVerifiedUser()
  const {error}=await supabase.from('saved_meals')
    .update({is_active:false})
    .eq('id',id)
    .eq('created_by',authUser.id)
    .select('id')
    .single()
  if(error)throw error
}

export async function loadSavedMeals():Promise<SavedMeal[]>{
  if(!supabase) throw new Error('Supabase не подключён')
  const {data:meals,error}=await supabase.from('saved_meals').select('id,name,meal_type,notes').eq('is_active',true).order('name')
  if(error) throw error
  if(!(meals??[]).length) return []
  const ids=(meals??[]).map(m=>m.id)
  const {data:items,error:itemError}=await supabase.from('saved_meal_items')
    .select('id,saved_meal_id,food_id,client_food_id,food_name_snapshot,grams,kcal_100_snapshot,protein_100_snapshot,fat_100_snapshot,carbs_100_snapshot,is_fixed,sort_order')
    .in('saved_meal_id',ids).order('sort_order')
  if(itemError) throw itemError
  const personalIds=[...new Set((items??[]).map(i=>i.client_food_id).filter(Boolean))] as string[]
  let activePersonalIds=new Set<string>()
  if(personalIds.length){
    const {data:activePersonal,error:personalError}=await supabase.from('client_foods')
      .select('id').in('id',personalIds).eq('is_active',true)
    if(personalError) throw personalError
    activePersonalIds=new Set((activePersonal??[]).map(item=>item.id))
  }
  return (meals??[]).map(meal=>({
    id:meal.id,name:meal.name,meal_type:meal.meal_type,notes:meal.notes,
    items:(items??[]).filter(i=>i.saved_meal_id===meal.id).map(i=>({
      local_id:i.id,food_id:i.food_id,client_food_id:i.client_food_id&&activePersonalIds.has(i.client_food_id)?i.client_food_id:null,name:i.food_name_snapshot,grams:num(i.grams),
      kcal_100:num(i.kcal_100_snapshot),protein_100:num(i.protein_100_snapshot),
      fat_100:num(i.fat_100_snapshot),carbs_100:num(i.carbs_100_snapshot),
      is_fixed:i.is_fixed,notes:'',
    })),
  }))
}

export async function createMyMealPlan(mealCount:number,foodIds:string[]):Promise<string>{
  if(!supabase) throw new Error('Supabase не подключён')
  const {data,error}=await supabase.rpc('create_my_meal_plan',{
    p_meal_count:mealCount,
    p_food_ids:foodIds,
  })
  if(error) throw error
  return data as string
}

export async function loadActiveNutritionPlan():Promise<ActiveNutritionPlan|null>{
  if(!supabase) throw new Error('Supabase не подключён')
  const db=supabase
  const authUser=await getVerifiedUser()
  const {data:plan,error}=await supabase.from('nutrition_plans')
    .select('id,name,description,daily_kcal_target,free_kcal_target,protein_target_g,fat_target_g,carbs_target_g,notes,version')
    .eq('client_id',authUser.id).eq('status','active').order('published_at',{ascending:false}).limit(1).maybeSingle()
  if(error) throw error
  if(!plan) return null

  const {data:meals,error:mealError}=await supabase.from('nutrition_plan_meals')
    .select('id,name,meal_type,kcal_target,target_locked,notes,sort_order').eq('plan_id',plan.id).order('sort_order')
  if(mealError) throw mealError
  const mealIds=(meals??[]).map(m=>m.id)
  const {data:variants,error:variantError}=mealIds.length
    ? await supabase.from('nutrition_plan_meal_variants').select('id,meal_id,name,is_default,notes,sort_order').in('meal_id',mealIds).order('sort_order')
    : {data:[],error:null}
  if(variantError) throw variantError
  const variantIds=(variants??[]).map(v=>v.id)
  const {data:items,error:itemError}=variantIds.length
    ? await db.from('nutrition_plan_meal_items').select('id,variant_id,food_id,client_food_id,food_name_snapshot,grams,kcal_100_snapshot,protein_100_snapshot,fat_100_snapshot,carbs_100_snapshot,is_fixed,sort_order,notes').in('variant_id',variantIds).order('sort_order')
    : {data:[],error:null}
  if(itemError) throw itemError

  const mappedMeals:ActiveNutritionMeal[]=(meals??[]).map(meal=>({
    id:meal.id,name:meal.name,meal_type:meal.meal_type,kcal_target:meal.kcal_target,target_locked:meal.target_locked,notes:meal.notes,
    variants:(variants??[]).filter(v=>v.meal_id===meal.id).map(v=>({
      id:v.id,name:v.name,is_default:v.is_default,notes:v.notes,
      items:(items??[]).filter(i=>i.variant_id===v.id).map(i=>({
        id:i.id,food_id:i.food_id,client_food_id:i.client_food_id,name:i.food_name_snapshot,grams:num(i.grams),kcal_100:num(i.kcal_100_snapshot),
        protein_100:num(i.protein_100_snapshot),fat_100:num(i.fat_100_snapshot),
        carbs_100:num(i.carbs_100_snapshot),is_fixed:i.is_fixed,notes:i.notes??'',
      })),
    })),
  }))

  return {
    id:plan.id,name:plan.name,description:plan.description,daily_kcal_target:plan.daily_kcal_target,
    free_kcal_target:Number(plan.free_kcal_target??0),
    protein_target_g:plan.protein_target_g==null?null:num(plan.protein_target_g),
    fat_target_g:plan.fat_target_g==null?null:num(plan.fat_target_g),
    carbs_target_g:plan.carbs_target_g==null?null:num(plan.carbs_target_g),
    notes:plan.notes,version:plan.version,meals:mappedMeals,
  }
}


export async function saveMyMealPlanVersion(planId:string,freeKcalTarget:number,meals:NutritionMealDraft[]):Promise<string>{
  if(!supabase)throw new Error('Supabase не подключён')
  const {data,error}=await supabase.rpc('save_my_meal_plan_version',{
    p_plan_id:planId,
    p_free_kcal_target:freeKcalTarget,
    p_meals:meals.map(meal=>({
      name:meal.name,meal_type:meal.meal_type,kcal_target:meal.kcal_target,
      target_locked:meal.target_locked,notes:meal.notes||null,
      variants:meal.variants.map(variant=>({
        name:variant.name,is_default:variant.is_default,notes:variant.notes||null,
        items:variant.items.map(item=>({
          food_id:item.food_id,client_food_id:item.client_food_id??null,name:item.name,grams:item.grams,
          kcal_100:item.kcal_100,protein_100:item.protein_100,
          fat_100:item.fat_100,carbs_100:item.carbs_100,
          is_fixed:item.is_fixed,notes:item.notes||null,
        })),
      })),
    })),
  })
  if(error)throw error
  return data as string
}

export async function loadClientFoodPreferences(clientId:string):Promise<Record<string,'preferred'|'allowed'|'hidden'|'avoid'>>{
  if(!supabase || !clientId) return {}
  const {data,error}=await supabase.from('client_food_preferences')
    .select('food_id,preference,is_enabled').eq('client_id',clientId)
  if(error) throw error
  return Object.fromEntries((data??[]).map(row=>[
    row.food_id,
    (!row.is_enabled ? 'hidden' : row.preference) as 'preferred'|'allowed'|'hidden'|'avoid'
  ]))
}


export type NutritionTargets={
  id:string
  valid_from:string
  calories_target:number|null
  calorie_tolerance:number
  protein_target_g:number|null
  fat_min_g:number|null
  fat_max_g:number|null
  carbs_target_g:number|null
}

export async function loadMyNutritionTargets():Promise<NutritionTargets|null>{
  if(!supabase)throw new Error('Supabase не подключён')
  const authUser=await getVerifiedUser()
  const today=appDateKey()
  const {data,error}=await supabase.from('client_targets')
    .select('id,valid_from,calories_target,calorie_tolerance,protein_target_g,fat_min_g,fat_max_g,carbs_target_g')
    .eq('client_id',authUser.id)
    .lte('valid_from',today)
    .or(`valid_to.is.null,valid_to.gte.${today}`)
    .order('valid_from',{ascending:false})
    .limit(1).maybeSingle()
  if(error)throw error
  if(!data)return null
  return {
    id:data.id,valid_from:data.valid_from,calories_target:data.calories_target,
    calorie_tolerance:Number(data.calorie_tolerance??100),
    protein_target_g:data.protein_target_g==null?null:Number(data.protein_target_g),
    fat_min_g:data.fat_min_g==null?null:Number(data.fat_min_g),
    fat_max_g:data.fat_max_g==null?null:Number(data.fat_max_g),
    carbs_target_g:data.carbs_target_g==null?null:Number(data.carbs_target_g),
  }
}

export function nutritionTargetHints(
  values:{calories:number|null;protein_g:number|null;fat_g:number|null;carbs_g:number|null},
  targets:NutritionTargets|null,
):string[]{
  if(!targets)return []
  const hints:string[]=[]
  if(values.calories!=null&&targets.calories_target!=null){
    const tolerance=targets.calorie_tolerance??0
    if(values.calories<targets.calories_target-tolerance)hints.push('Калорий ниже ориентира')
    else if(values.calories>targets.calories_target+tolerance)hints.push('Калорий выше ориентира')
  }
  if(values.protein_g!=null&&targets.protein_target_g!=null&&values.protein_g<targets.protein_target_g)hints.push('Белка маловато')
  if(values.fat_g!=null&&targets.fat_min_g!=null&&values.fat_g<targets.fat_min_g)hints.push('Жиров маловато')
  if(values.fat_g!=null&&targets.fat_max_g!=null&&values.fat_g>targets.fat_max_g)hints.push('Жиров выше диапазона')
  if(values.carbs_g!=null&&targets.carbs_target_g!=null){
    const delta=Math.max(10,targets.carbs_target_g*.1)
    if(values.carbs_g<targets.carbs_target_g-delta)hints.push('Углеводов ниже ориентира')
    else if(values.carbs_g>targets.carbs_target_g+delta)hints.push('Углеводов выше ориентира')
  }
  return hints
}

export async function loadTodayNutritionCheckin():Promise<NutritionDailyCheckin|null>{
  if(!supabase) throw new Error('Supabase не подключён')
  const authUser=await getVerifiedUser()
  const today=appDateKey()
  const {data,error}=await supabase.from('daily_checkins')
    .select('id,checkin_date,nutrition_mode,nutrition_adherence,nutrition_deviation,calories,protein_g,fat_g,carbs_g,nutrition_plan_id')
    .eq('client_id',authUser.id).eq('checkin_date',today).maybeSingle()
  if(error) throw error
  if(!data)return null
  return {
    id:data.id,checkin_date:data.checkin_date,
    nutrition_mode:(data.nutrition_mode??'manual') as 'meal_plan'|'manual',
    nutrition_adherence:data.nutrition_adherence as NutritionDailyCheckin['nutrition_adherence'],
    nutrition_deviation:data.nutrition_deviation as NutritionDailyCheckin['nutrition_deviation'],
    calories:data.calories,protein_g:data.protein_g==null?null:Number(data.protein_g),
    fat_g:data.fat_g==null?null:Number(data.fat_g),carbs_g:data.carbs_g==null?null:Number(data.carbs_g),
    nutrition_plan_id:data.nutrition_plan_id,
  }
}

export type NutritionTrendDay={
  date:string
  calories:number|null
  protein_g:number|null
  fat_g:number|null
  carbs_g:number|null
  weight_kg:number|null
  waist_cm:number|null
}

function shiftDateKey(dateKey:string,days:number){
  const [year,month,day]=dateKey.split('-').map(Number)
  const date=new Date(Date.UTC(year,month-1,day+days,12))
  return date.toISOString().slice(0,10)
}

export async function loadMyNutritionTrend(days=14):Promise<NutritionTrendDay[]>{
  if(!supabase)throw new Error('Supabase не подключён')
  const authUser=await getVerifiedUser()
  const today=appDateKey()
  const since=shiftDateKey(today,-Math.max(1,days-1))
  const [{data:checkins,error:checkinsError},{data:measurements,error:measurementsError}]=await Promise.all([
    supabase.from('daily_checkins')
      .select('checkin_date,calories,protein_g,fat_g,carbs_g')
      .eq('client_id',authUser.id)
      .gte('checkin_date',since).lte('checkin_date',today)
      .order('checkin_date',{ascending:true}),
    supabase.from('measurements')
      .select('measured_at,weight_kg,waist_cm,id')
      .eq('client_id',authUser.id)
      .gte('measured_at',since).lte('measured_at',today)
      .order('measured_at',{ascending:true}).order('id',{ascending:true}),
  ])
  if(checkinsError)throw checkinsError
  if(measurementsError)throw measurementsError

  const byDate=new Map<string,NutritionTrendDay>()
  for(let i=0;i<days;i++){
    const date=shiftDateKey(today,-(days-1-i))
    byDate.set(date,{date,calories:null,protein_g:null,fat_g:null,carbs_g:null,weight_kg:null,waist_cm:null})
  }
  for(const row of checkins??[]){
    const item=byDate.get(row.checkin_date)
    if(!item)continue
    item.calories=row.calories==null?null:Number(row.calories)
    item.protein_g=row.protein_g==null?null:Number(row.protein_g)
    item.fat_g=row.fat_g==null?null:Number(row.fat_g)
    item.carbs_g=row.carbs_g==null?null:Number(row.carbs_g)
  }
  for(const row of measurements??[]){
    const item=byDate.get(row.measured_at)
    if(!item)continue
    if(row.weight_kg!=null)item.weight_kg=Number(row.weight_kg)
    if(row.waist_cm!=null)item.waist_cm=Number(row.waist_cm)
  }
  return [...byDate.values()]
}


export async function saveTodayNutritionCheckin(input:{
  mode:'meal_plan'|'manual'
  adherence:'followed'|'partial'|'not_followed'|null
  deviation:'about_target'|'over'|'under'|'unknown'|null
  calories:number|null
  protein_g:number|null
  fat_g:number|null
  carbs_g:number|null
  plan_id:string|null
}){
  if(!supabase) throw new Error('Supabase не подключён')
  const today=appDateKey()
  const {data,error}=await supabase.rpc('save_my_nutrition_checkin_v2',{
    p_date:today,
    p_mode:input.mode,
    p_adherence:input.adherence,
    p_deviation:input.deviation,
    p_calories:input.calories,
    p_protein_g:input.protein_g,
    p_fat_g:input.fat_g,
    p_carbs_g:input.carbs_g,
    p_plan_id:input.plan_id,
  })
  if(error) throw error
  return data as string
}


export async function loadNutritionFoods():Promise<NutritionFood[]>{
  if(!supabase) throw new Error('Supabase не подключён')
  const {data,error}=await supabase.from('foods')
    .select('id,name,kcal_100,protein_100,fat_100,carbs_100,default_portion_g')
    .eq('is_active',true).order('name')
  if(error) throw error
  const ids=(data??[]).map(f=>f.id)
  let categoryMap=new Map<string,string[]>()
  if(ids.length){
    const {data:links,error:linkError}=await supabase.from('food_category_links')
      .select('food_id,food_categories(slug)').in('food_id',ids)
    if(!linkError)for(const row of links??[]){
      const slug=(row.food_categories as unknown as {slug:string}|null)?.slug
      if(!slug)continue
      categoryMap.set(row.food_id,[...(categoryMap.get(row.food_id)??[]),slug])
    }
  }
  return (data??[]).map(f=>({
    id:f.id,name:f.name,categories:categoryMap.get(f.id)??[],
    kcal_100:num(f.kcal_100),protein_100:num(f.protein_100),
    fat_100:num(f.fat_100),carbs_100:num(f.carbs_100),
    default_portion_g:f.default_portion_g==null?null:num(f.default_portion_g),
  }))
}

export async function loadMyFoodPreferences():Promise<Record<string,'preferred'|'allowed'|'hidden'|'avoid'>>{
  if(!supabase) throw new Error('Supabase не подключён')
  const authUser=await getVerifiedUser()
  return loadClientFoodPreferences(authUser.id)
}

export async function setMyFoodPreference(foodId:string,preference:'preferred'|'allowed'|'avoid'){
  if(!supabase) throw new Error('Supabase не подключён')
  const authUser=await getVerifiedUser()
  const {error}=await supabase.from('client_food_preferences').upsert({
    client_id:authUser.id,food_id:foodId,preference,is_enabled:preference!=='avoid',updated_at:new Date().toISOString(),
  },{onConflict:'client_id,food_id'})
  if(error) throw error
}


export async function loadClientFoodCatalog(clientId:string):Promise<NutritionFood[]>{
  if(!supabase) throw new Error('Supabase не подключён')
  const [base,{data:prefs,error:prefError},{data:personal,error:personalError}]=await Promise.all([
    loadNutritionFoods(),
    supabase.from('client_food_preferences')
      .select('food_id,preference,is_enabled,custom_name,custom_kcal_100,custom_protein_100,custom_fat_100,custom_carbs_100,custom_default_portion_g,usage_count,last_used_at')
      .eq('client_id',clientId),
    supabase.from('client_foods')
      .select('id,name,kcal_100,protein_100,fat_100,carbs_100,default_portion_g,is_favorite,usage_count,last_used_at')
      .eq('client_id',clientId).eq('is_active',true),
  ])
  if(prefError) throw prefError
  if(personalError) throw personalError

  const prefMap=new Map((prefs??[]).map(p=>[p.food_id,p]))
  const globalFoods=base.flatMap(food=>{
    const p=prefMap.get(food.id)
    if(p && (!p.is_enabled || p.preference==='avoid')) return []
    return [{
      ...food,
      name:p?.custom_name??food.name,
      base_name:food.name,
      source:'global' as const,
      favorite:p?.preference==='preferred',
      usage_count:p?.usage_count??0,
      last_used_at:p?.last_used_at??null,
      overridden:Boolean(
        p?.custom_name!=null || p?.custom_kcal_100!=null || p?.custom_protein_100!=null || p?.custom_fat_100!=null
        || p?.custom_carbs_100!=null || p?.custom_default_portion_g!=null
      ),
      kcal_100:p?.custom_kcal_100==null?food.kcal_100:num(p.custom_kcal_100),
      protein_100:p?.custom_protein_100==null?food.protein_100:num(p.custom_protein_100),
      fat_100:p?.custom_fat_100==null?food.fat_100:num(p.custom_fat_100),
      carbs_100:p?.custom_carbs_100==null?food.carbs_100:num(p.custom_carbs_100),
      default_portion_g:p?.custom_default_portion_g==null?food.default_portion_g:num(p.custom_default_portion_g),
    }]
  })

  const personalFoods:NutritionFood[]=(personal??[]).map(p=>({
    id:p.id,name:p.name,base_name:p.name,kcal_100:num(p.kcal_100),protein_100:num(p.protein_100),
    fat_100:num(p.fat_100),carbs_100:num(p.carbs_100),
    default_portion_g:p.default_portion_g==null?null:num(p.default_portion_g),
    categories:[],source:'personal',favorite:p.is_favorite,usage_count:p.usage_count??0,
    last_used_at:p.last_used_at??null,overridden:false,
  }))

  return [...globalFoods,...personalFoods]
}

export async function loadMyFoodCatalog():Promise<NutritionFood[]>{
  if(!supabase) throw new Error('Supabase не подключён')
  const authUser=await getVerifiedUser()
  return loadClientFoodCatalog(authUser.id)
}

export async function recordMyFoodUse(food:NutritionFood){
  if(!supabase) throw new Error('Supabase не подключён')
  const {error}=await supabase.rpc('record_my_food_use',{
    p_food_id:food.source==='personal'?null:food.id,
    p_client_food_id:food.source==='personal'?food.id:null,
  })
  if(error) throw error
}

export async function setMyPersonalFoodFavorite(id:string,isFavorite:boolean){
  if(!supabase) throw new Error('Supabase не подключён')
  const authUser=await getVerifiedUser()
  const {error}=await supabase.from('client_foods')
    .update({is_favorite:isFavorite,updated_at:new Date().toISOString()})
    .eq('id',id).eq('client_id',authUser.id).select('id').single()
  if(error) throw error
}

export async function createMyPersonalFood(input:Omit<NutritionFood,'id'|'source'|'favorite'|'usage_count'|'last_used_at'|'overridden'|'categories'>):Promise<NutritionFood>{
  if(!supabase) throw new Error('Supabase не подключён')
  const authUser=await getVerifiedUser()
  const {data,error}=await supabase.from('client_foods').insert({
    client_id:authUser.id,name:input.name.trim(),
    kcal_100:input.kcal_100,protein_100:input.protein_100,fat_100:input.fat_100,carbs_100:input.carbs_100,
    default_portion_g:input.default_portion_g,is_favorite:true,
  }).select('id,name,kcal_100,protein_100,fat_100,carbs_100,default_portion_g,is_favorite,usage_count,last_used_at').single()
  if(error) throw error
  return {
    id:data.id,name:data.name,kcal_100:num(data.kcal_100),protein_100:num(data.protein_100),
    fat_100:num(data.fat_100),carbs_100:num(data.carbs_100),
    default_portion_g:data.default_portion_g==null?null:num(data.default_portion_g),
    source:'personal',base_name:data.name,favorite:data.is_favorite,usage_count:data.usage_count??0,last_used_at:data.last_used_at??null,
    categories:[],
  }
}

export async function archiveMyPersonalFood(id:string):Promise<void>{
  if(!supabase)throw new Error('Supabase не подключён')
  const authUser=await getVerifiedUser()
  const {error}=await supabase.from('client_foods')
    .update({is_active:false,updated_at:new Date().toISOString()})
    .eq('id',id)
    .eq('client_id',authUser.id)
    .select('id')
    .single()
  if(error)throw error
}

export async function updateMyPersonalFood(food:NutritionFood):Promise<void>{
  if(!supabase) throw new Error('Supabase не подключён')
  const authUser=await getVerifiedUser()
  const {error}=await supabase.from('client_foods').update({
    name:food.name.trim(),kcal_100:food.kcal_100,protein_100:food.protein_100,
    fat_100:food.fat_100,carbs_100:food.carbs_100,default_portion_g:food.default_portion_g,
    updated_at:new Date().toISOString(),
  }).eq('id',food.id).eq('client_id',authUser.id).select('id').single()
  if(error) throw error
}

export async function saveMyFoodOverride(food:NutritionFood):Promise<void>{
  if(!supabase) throw new Error('Supabase не подключён')
  if(food.source==='personal') return updateMyPersonalFood(food)
  const {error}=await supabase.rpc('save_my_food_override_v2',{
    p_food_id:food.id,p_name:food.name===food.base_name?null:food.name,
    p_kcal_100:food.kcal_100,p_protein_100:food.protein_100,
    p_fat_100:food.fat_100,p_carbs_100:food.carbs_100,p_default_portion_g:food.default_portion_g,
  })
  if(error) throw error
}

export async function clearMyFoodOverride(foodId:string):Promise<void>{
  if(!supabase) throw new Error('Supabase не подключён')
  const {error}=await supabase.rpc('clear_my_food_override',{p_food_id:foodId})
  if(error) throw error
}


export async function createNutritionPlanRevision(planId:string):Promise<string>{
  if(!supabase)throw new Error('Supabase не подключён')
  const {data,error}=await supabase.rpc('create_nutrition_plan_revision',{p_plan_id:planId})
  if(error)throw error
  return data as string
}

export type TrainerClientNutritionPlanSummary = {
  id:string
  name:string
  status:'draft'|'active'|'archived'
  version:number
  daily_kcal_target:number
  protein_target_g:number|null
  published_at:string|null
  updated_at:string
}

export async function loadTrainerClientNutritionPlans(clientId:string):Promise<TrainerClientNutritionPlanSummary[]>{
  if(!supabase) throw new Error('Supabase не подключён')
  const {data,error}=await supabase.rpc('get_trainer_client_nutrition_plans',{p_client_id:clientId})
  if(error) throw error
  return (data??[]) as TrainerClientNutritionPlanSummary[]
}

export type NutritionTemplateSummary={
  id:string;name:string;description:string|null;daily_kcal_target:number;protein_target_g:number|null;updated_at:string
}
export async function loadTrainerNutritionTemplates():Promise<NutritionTemplateSummary[]>{
  if(!supabase) throw new Error('Supabase не подключён')
  const {data,error}=await supabase.rpc('get_trainer_nutrition_templates')
  if(error) throw error
  return (data??[]) as NutritionTemplateSummary[]
}
export async function assignNutritionTemplate(templateId:string,clientId:string):Promise<string>{
  if(!supabase) throw new Error('Supabase не подключён')
  const {data,error}=await supabase.rpc('assign_nutrition_template',{p_template_id:templateId,p_client_id:clientId})
  if(error) throw error
  return data as string
}

export type NutritionGoal='lose_slow'|'lose_standard'|'lose_fast'|'maintain'|'gain_slow'|'gain_fast'
export type DailyActivityLevel='sedentary'|'mixed'|'on_feet'|'physical'
export type CardioIntensity='light'|'moderate'|'vigorous'

export type NutritionTrackingMode='meal_plan'|'calorie_tracking'

export type MyNutritionSetup={
  sex_for_calculation:'male'|'female'
  height_cm:number
  average_steps:number
  training_days_per_week:number
  goal:NutritionGoal
  daily_activity_level:DailyActivityLevel
  strength_sessions_per_week:number
  strength_minutes_per_session:number
  cardio_sessions_per_week:number
  cardio_minutes_per_session:number
  cardio_intensity:CardioIntensity
  bmr_kcal:number|null
  activity_factor:number|null
  exercise_kcal_day:number|null
  weight_kg_used:number|null
  age_used:number|null
  estimated_maintenance_kcal:number
  target_kcal:number
  estimated_weekly_change_kg:number|null
  calculation_method:string
  tracking_mode:NutritionTrackingMode
  tracking_mode_changed_at:string|null
  tracking_mode_changed_by:string|null
}

export async function loadMyNutritionSetup():Promise<MyNutritionSetup|null>{
  if(!supabase)return null
  const {data,error}=await supabase.from('client_nutrition_setup').select('*').maybeSingle()
  if(error)throw error
  if(!data)return null

  const legacyGoal=data.goal==='lose'?'lose_standard':data.goal==='gain'?'gain_slow':data.goal
  return {
    ...data,
    goal:(legacyGoal||'maintain') as NutritionGoal,
    daily_activity_level:(data.daily_activity_level||'sedentary') as DailyActivityLevel,
    strength_sessions_per_week:Number(data.strength_sessions_per_week??data.training_days_per_week??0),
    strength_minutes_per_session:Number(data.strength_minutes_per_session??60),
    cardio_sessions_per_week:Number(data.cardio_sessions_per_week??0),
    cardio_minutes_per_session:Number(data.cardio_minutes_per_session??30),
    cardio_intensity:(data.cardio_intensity||'moderate') as CardioIntensity,
    bmr_kcal:data.bmr_kcal==null?null:Number(data.bmr_kcal),
    activity_factor:data.activity_factor==null?null:Number(data.activity_factor),
    exercise_kcal_day:data.exercise_kcal_day==null?null:Number(data.exercise_kcal_day),
    weight_kg_used:data.weight_kg_used==null?null:Number(data.weight_kg_used),
    age_used:data.age_used==null?null:Number(data.age_used),
    estimated_maintenance_kcal:Number(data.estimated_maintenance_kcal),
    target_kcal:Number(data.target_kcal),
    estimated_weekly_change_kg:data.estimated_weekly_change_kg==null?null:Number(data.estimated_weekly_change_kg),
    calculation_method:data.calculation_method||'legacy_v1',
    tracking_mode:(data.tracking_mode||'meal_plan') as NutritionTrackingMode,
    tracking_mode_changed_at:data.tracking_mode_changed_at??null,
    tracking_mode_changed_by:data.tracking_mode_changed_by??null,
  } as MyNutritionSetup
}

export async function setNutritionTrackingMode(clientId:string,mode:NutritionTrackingMode):Promise<NutritionTrackingMode>{
  if(!supabase)throw new Error('Supabase не подключён')
  const {data,error}=await supabase.rpc('set_nutrition_tracking_mode',{p_client_id:clientId,p_mode:mode})
  if(error)throw error
  return data as NutritionTrackingMode
}

export async function setMyNutritionTrackingMode(mode:NutritionTrackingMode):Promise<NutritionTrackingMode>{
  if(!supabase)throw new Error('Supabase не подключён')
  const authUser=await getVerifiedUser()
  return setNutritionTrackingMode(authUser.id,mode)
}

export async function loadTrainerClientNutritionMode(clientId:string):Promise<NutritionTrackingMode>{
  if(!supabase)throw new Error('Supabase не подключён')
  const {data,error}=await supabase.from('client_nutrition_setup')
    .select('tracking_mode')
    .eq('client_id',clientId)
    .maybeSingle()
  if(error)throw error
  return (data?.tracking_mode||'calorie_tracking') as NutritionTrackingMode
}

export async function loadLatestWeightForNutrition():Promise<number|null>{
  if(!supabase)return null
  const authUser=await getVerifiedUser()
  const {data,error}=await supabase.from('measurements')
    .select('weight_kg,measured_at,id')
    .eq('client_id',authUser.id)
    .not('weight_kg','is',null)
    .order('measured_at',{ascending:false})
    .order('id',{ascending:false})
    .limit(1)
    .maybeSingle()
  if(error)throw error
  return data?.weight_kg==null?null:Number(data.weight_kg)
}

export async function saveMyNutritionSetup(input:{
  sex:'male'|'female'
  height:number
  steps:number
  dailyActivity:DailyActivityLevel
  strengthSessions:number
  strengthMinutes:number
  cardioSessions:number
  cardioMinutes:number
  cardioIntensity:CardioIntensity
  goal:NutritionGoal
  weight:number|null
}){
  if(!supabase)throw new Error('Supabase не подключён')
  const {data,error}=await supabase.rpc('save_my_nutrition_setup_v3',{
    p_sex:input.sex,
    p_height:input.height,
    p_weight:input.weight,
    p_steps:input.steps,
    p_daily_activity:input.dailyActivity,
    p_strength_sessions:input.strengthSessions,
    p_strength_minutes:input.strengthMinutes,
    p_cardio_sessions:input.cardioSessions,
    p_cardio_minutes:input.cardioMinutes,
    p_cardio_intensity:input.cardioIntensity,
    p_goal:input.goal,
  })
  if(error)throw error
  return (data?.[0]??null) as {
    bmr_kcal:number
    maintenance_kcal:number
    target_kcal:number
    activity_factor:number
    exercise_kcal_day:number
    estimated_weekly_change_kg:number
    weight_kg_used:number
    age_used:number
  }|null
}
