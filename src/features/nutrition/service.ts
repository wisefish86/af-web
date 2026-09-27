import { supabase } from '../../lib/supabase'
import type {
  ActiveNutritionMeal, ActiveNutritionPlan, NutritionBuilderReferences, NutritionFood,
  NutritionMealItemDraft, NutritionPlanDraft, SavedMeal
} from './types'

function num(value:unknown) {
  return value == null ? 0 : Number(value)
}

export async function loadNutritionBuilderReferences():Promise<NutritionBuilderReferences> {
  if (!supabase) throw new Error('Supabase не подключён')
  const [{data:auth,error:authError},{data:foods,error:foodError}] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('foods').select('id,name,kcal_100,protein_100,fat_100,carbs_100,default_portion_g').eq('is_active',true).order('name'),
  ])
  if (authError || !auth.user) throw authError ?? new Error('Нужно войти как тренер')
  if (foodError) throw foodError

  const {data:relations,error:relationError}=await supabase
    .from('coach_clients').select('client_id')
    .eq('coach_id',auth.user.id).eq('status','active')
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

export async function createNutritionFood(input:Omit<NutritionFood,'id'>):Promise<NutritionFood>{
  if(!supabase) throw new Error('Supabase не подключён')
  const {data,error}=await supabase.from('foods').insert({
    name:input.name.trim(),kcal_100:input.kcal_100,protein_100:input.protein_100,
    fat_100:input.fat_100,carbs_100:input.carbs_100,
    default_portion_g:input.default_portion_g,
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
  const {data:auth,error:authError}=await supabase.auth.getUser()
  if(authError||!auth.user) throw authError??new Error('Нужно войти')
  const {data:meal,error}=await supabase.from('saved_meals').insert({
    created_by:auth.user.id,name:name.trim(),meal_type:mealType,
  }).select('id').single()
  if(error) throw error
  if(items.length){
    const {error:itemError}=await supabase.from('saved_meal_items').insert(items.map((item,index)=>({
      saved_meal_id:meal.id,food_id:item.food_id,food_name_snapshot:item.name,grams:item.grams,
      kcal_100_snapshot:item.kcal_100,protein_100_snapshot:item.protein_100,
      fat_100_snapshot:item.fat_100,carbs_100_snapshot:item.carbs_100,
      is_fixed:item.is_fixed,sort_order:(index+1)*10,
    })))
    if(itemError) throw itemError
  }
  return meal.id as string
}

export async function loadSavedMeals():Promise<SavedMeal[]>{
  if(!supabase) throw new Error('Supabase не подключён')
  const {data:meals,error}=await supabase.from('saved_meals').select('id,name,meal_type,notes').eq('is_active',true).order('name')
  if(error) throw error
  if(!(meals??[]).length) return []
  const ids=(meals??[]).map(m=>m.id)
  const {data:items,error:itemError}=await supabase.from('saved_meal_items')
    .select('id,saved_meal_id,food_id,food_name_snapshot,grams,kcal_100_snapshot,protein_100_snapshot,fat_100_snapshot,carbs_100_snapshot,is_fixed,sort_order')
    .in('saved_meal_id',ids).order('sort_order')
  if(itemError) throw itemError
  return (meals??[]).map(meal=>({
    id:meal.id,name:meal.name,meal_type:meal.meal_type,notes:meal.notes,
    items:(items??[]).filter(i=>i.saved_meal_id===meal.id).map(i=>({
      local_id:i.id,food_id:i.food_id,name:i.food_name_snapshot,grams:num(i.grams),
      kcal_100:num(i.kcal_100_snapshot),protein_100:num(i.protein_100_snapshot),
      fat_100:num(i.fat_100_snapshot),carbs_100:num(i.carbs_100_snapshot),
      is_fixed:i.is_fixed,notes:'',
    })),
  }))
}

export async function loadActiveNutritionPlan():Promise<ActiveNutritionPlan|null>{
  if(!supabase) throw new Error('Supabase не подключён')
  const {data:auth,error:authError}=await supabase.auth.getUser()
  if(authError||!auth.user) throw authError??new Error('Нужно войти')
  const {data:plan,error}=await supabase.from('nutrition_plans')
    .select('id,name,description,daily_kcal_target,protein_target_g,fat_target_g,carbs_target_g,notes,version')
    .eq('client_id',auth.user.id).eq('status','active').order('published_at',{ascending:false}).limit(1).maybeSingle()
  if(error) throw error
  if(!plan) return null

  const {data:meals,error:mealError}=await supabase.from('nutrition_plan_meals')
    .select('id,name,meal_type,kcal_target,notes,sort_order').eq('plan_id',plan.id).order('sort_order')
  if(mealError) throw mealError
  const mealIds=(meals??[]).map(m=>m.id)
  const {data:variants,error:variantError}=mealIds.length
    ? await supabase.from('nutrition_plan_meal_variants').select('id,meal_id,name,is_default,notes,sort_order').in('meal_id',mealIds).order('sort_order')
    : {data:[],error:null}
  if(variantError) throw variantError
  const variantIds=(variants??[]).map(v=>v.id)
  const {data:items,error:itemError}=variantIds.length
    ? await supabase.from('nutrition_plan_meal_items').select('id,variant_id,food_name_snapshot,grams,kcal_100_snapshot,protein_100_snapshot,fat_100_snapshot,carbs_100_snapshot,is_fixed,sort_order').in('variant_id',variantIds).order('sort_order')
    : {data:[],error:null}
  if(itemError) throw itemError

  const mappedMeals:ActiveNutritionMeal[]=(meals??[]).map(meal=>({
    id:meal.id,name:meal.name,meal_type:meal.meal_type,kcal_target:meal.kcal_target,notes:meal.notes,
    variants:(variants??[]).filter(v=>v.meal_id===meal.id).map(v=>({
      id:v.id,name:v.name,is_default:v.is_default,notes:v.notes,
      items:(items??[]).filter(i=>i.variant_id===v.id).map(i=>({
        id:i.id,name:i.food_name_snapshot,grams:num(i.grams),kcal_100:num(i.kcal_100_snapshot),
        protein_100:num(i.protein_100_snapshot),fat_100:num(i.fat_100_snapshot),
        carbs_100:num(i.carbs_100_snapshot),is_fixed:i.is_fixed,
      })),
    })),
  }))

  return {
    id:plan.id,name:plan.name,description:plan.description,daily_kcal_target:plan.daily_kcal_target,
    protein_target_g:plan.protein_target_g==null?null:num(plan.protein_target_g),
    fat_target_g:plan.fat_target_g==null?null:num(plan.fat_target_g),
    carbs_target_g:plan.carbs_target_g==null?null:num(plan.carbs_target_g),
    notes:plan.notes,version:plan.version,meals:mappedMeals,
  }
}
