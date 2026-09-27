import { supabase } from '../../lib/supabase'
import type {
  ActiveNutritionMeal, ActiveNutritionPlan, NutritionBuilderReferences, NutritionDailyCheckin, NutritionFood,
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


export async function loadTodayNutritionCheckin():Promise<NutritionDailyCheckin|null>{
  if(!supabase) throw new Error('Supabase не подключён')
  const {data:auth,error:authError}=await supabase.auth.getUser()
  if(authError||!auth.user) throw authError??new Error('Нужно войти')
  const today=new Date().toISOString().slice(0,10)
  const {data,error}=await supabase.from('daily_checkins')
    .select('id,checkin_date,nutrition_mode,nutrition_adherence,nutrition_deviation,calories,protein_g,nutrition_plan_id')
    .eq('client_id',auth.user.id).eq('checkin_date',today).maybeSingle()
  if(error) throw error
  if(!data)return null
  return {
    id:data.id,checkin_date:data.checkin_date,
    nutrition_mode:(data.nutrition_mode??'manual') as 'meal_plan'|'manual',
    nutrition_adherence:data.nutrition_adherence as NutritionDailyCheckin['nutrition_adherence'],
    nutrition_deviation:data.nutrition_deviation as NutritionDailyCheckin['nutrition_deviation'],
    calories:data.calories,protein_g:data.protein_g==null?null:Number(data.protein_g),
    nutrition_plan_id:data.nutrition_plan_id,
  }
}

export async function saveTodayNutritionCheckin(input:{
  mode:'meal_plan'|'manual'
  adherence:'followed'|'partial'|'not_followed'|null
  deviation:'about_target'|'over'|'under'|'unknown'|null
  calories:number|null
  protein_g:number|null
  plan_id:string|null
}){
  if(!supabase) throw new Error('Supabase не подключён')
  const today=new Date().toISOString().slice(0,10)
  const {data,error}=await supabase.rpc('save_my_nutrition_checkin',{
    p_date:today,
    p_mode:input.mode,
    p_adherence:input.adherence,
    p_deviation:input.deviation,
    p_calories:input.calories,
    p_protein_g:input.protein_g,
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
    if(linkError) throw linkError
    for(const row of links??[]){
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
  const {data:auth,error:authError}=await supabase.auth.getUser()
  if(authError||!auth.user) throw authError??new Error('Нужно войти')
  return loadClientFoodPreferences(auth.user.id)
}

export async function setMyFoodPreference(foodId:string,preference:'preferred'|'allowed'|'avoid'){
  if(!supabase) throw new Error('Supabase не подключён')
  const {data:auth,error:authError}=await supabase.auth.getUser()
  if(authError||!auth.user) throw authError??new Error('Нужно войти')
  const {error}=await supabase.from('client_food_preferences').upsert({
    client_id:auth.user.id,food_id:foodId,preference,is_enabled:preference!=='avoid',updated_at:new Date().toISOString(),
  },{onConflict:'client_id,food_id'})
  if(error) throw error
}


export async function loadClientFoodCatalog(clientId:string):Promise<NutritionFood[]>{
  if(!supabase) throw new Error('Supabase не подключён')
  const [base,{data:prefs,error:prefError},{data:personal,error:personalError}]=await Promise.all([
    loadNutritionFoods(),
    supabase.from('client_food_preferences')
      .select('food_id,preference,is_enabled,custom_kcal_100,custom_protein_100,custom_fat_100,custom_carbs_100,custom_default_portion_g,usage_count,last_used_at')
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
      source:'global' as const,
      favorite:p?.preference==='preferred',
      usage_count:p?.usage_count??0,
      last_used_at:p?.last_used_at??null,
      overridden:Boolean(
        p?.custom_kcal_100!=null || p?.custom_protein_100!=null || p?.custom_fat_100!=null
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
    id:p.id,name:p.name,kcal_100:num(p.kcal_100),protein_100:num(p.protein_100),
    fat_100:num(p.fat_100),carbs_100:num(p.carbs_100),
    default_portion_g:p.default_portion_g==null?null:num(p.default_portion_g),
    categories:[],source:'personal',favorite:p.is_favorite,usage_count:p.usage_count??0,
    last_used_at:p.last_used_at??null,overridden:false,
  }))

  return [...globalFoods,...personalFoods]
}

export async function loadMyFoodCatalog():Promise<NutritionFood[]>{
  if(!supabase) throw new Error('Supabase не подключён')
  const {data:auth,error}=await supabase.auth.getUser()
  if(error||!auth.user) throw error??new Error('Нужно войти')
  return loadClientFoodCatalog(auth.user.id)
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
  const {data:auth,error:authError}=await supabase.auth.getUser()
  if(authError||!auth.user) throw authError??new Error('Нужно войти')
  const {error}=await supabase.from('client_foods')
    .update({is_favorite:isFavorite,updated_at:new Date().toISOString()})
    .eq('id',id).eq('client_id',auth.user.id)
  if(error) throw error
}

export async function createMyPersonalFood(input:Omit<NutritionFood,'id'|'source'|'favorite'|'usage_count'|'last_used_at'|'overridden'|'categories'>):Promise<NutritionFood>{
  if(!supabase) throw new Error('Supabase не подключён')
  const {data:auth,error:authError}=await supabase.auth.getUser()
  if(authError||!auth.user) throw authError??new Error('Нужно войти')
  const {data,error}=await supabase.from('client_foods').insert({
    client_id:auth.user.id,name:input.name.trim(),
    kcal_100:input.kcal_100,protein_100:input.protein_100,fat_100:input.fat_100,carbs_100:input.carbs_100,
    default_portion_g:input.default_portion_g,is_favorite:true,
  }).select('id,name,kcal_100,protein_100,fat_100,carbs_100,default_portion_g,is_favorite,usage_count,last_used_at').single()
  if(error) throw error
  return {
    id:data.id,name:data.name,kcal_100:num(data.kcal_100),protein_100:num(data.protein_100),
    fat_100:num(data.fat_100),carbs_100:num(data.carbs_100),
    default_portion_g:data.default_portion_g==null?null:num(data.default_portion_g),
    source:'personal',favorite:data.is_favorite,usage_count:data.usage_count??0,last_used_at:data.last_used_at??null,
    categories:[],
  }
}

export async function updateMyPersonalFood(food:NutritionFood):Promise<void>{
  if(!supabase) throw new Error('Supabase не подключён')
  const {data:auth,error:authError}=await supabase.auth.getUser()
  if(authError||!auth.user) throw authError??new Error('Нужно войти')
  const {error}=await supabase.from('client_foods').update({
    name:food.name.trim(),kcal_100:food.kcal_100,protein_100:food.protein_100,
    fat_100:food.fat_100,carbs_100:food.carbs_100,default_portion_g:food.default_portion_g,
    updated_at:new Date().toISOString(),
  }).eq('id',food.id).eq('client_id',auth.user.id)
  if(error) throw error
}

export async function saveMyFoodOverride(food:NutritionFood):Promise<void>{
  if(!supabase) throw new Error('Supabase не подключён')
  if(food.source==='personal') return updateMyPersonalFood(food)
  const {error}=await supabase.rpc('save_my_food_override',{
    p_food_id:food.id,p_kcal_100:food.kcal_100,p_protein_100:food.protein_100,
    p_fat_100:food.fat_100,p_carbs_100:food.carbs_100,p_default_portion_g:food.default_portion_g,
  })
  if(error) throw error
}

export async function clearMyFoodOverride(foodId:string):Promise<void>{
  if(!supabase) throw new Error('Supabase не подключён')
  const {error}=await supabase.rpc('clear_my_food_override',{p_food_id:foodId})
  if(error) throw error
}
