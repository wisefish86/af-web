export type NutritionFood = {
  id:string
  name:string
  kcal_100:number
  protein_100:number
  fat_100:number
  carbs_100:number
  default_portion_g:number|null
}

export type NutritionMealItemDraft = {
  local_id:string
  food_id:string|null
  name:string
  grams:number
  kcal_100:number
  protein_100:number
  fat_100:number
  carbs_100:number
  is_fixed:boolean
  notes:string
}

export type NutritionMealVariantDraft = {
  local_id:string
  name:string
  is_default:boolean
  notes:string
  items:NutritionMealItemDraft[]
}

export type NutritionMealDraft = {
  local_id:string
  name:string
  meal_type:'main'|'light'|'snack'
  kcal_target:number
  target_locked:boolean
  notes:string
  variants:NutritionMealVariantDraft[]
}

export type NutritionPlanDraft = {
  id:string|null
  client_id:string
  name:string
  description:string
  daily_kcal_target:number
  protein_target_g:number|null
  fat_target_g:number|null
  carbs_target_g:number|null
  notes:string
  meals:NutritionMealDraft[]
}

export type NutritionBuilderReferences = {
  clients:{id:string;name:string}[]
  foods:NutritionFood[]
}

export type SavedMeal = {
  id:string
  name:string
  meal_type:'main'|'light'|'snack'
  notes:string|null
  items:NutritionMealItemDraft[]
}

export type ActiveNutritionItem = Omit<NutritionMealItemDraft,'local_id'|'food_id'|'notes'> & {id:string}
export type ActiveNutritionVariant = {
  id:string
  name:string
  is_default:boolean
  notes:string|null
  items:ActiveNutritionItem[]
}
export type ActiveNutritionMeal = {
  id:string
  name:string
  meal_type:'main'|'light'|'snack'
  kcal_target:number
  notes:string|null
  variants:ActiveNutritionVariant[]
}
export type ActiveNutritionPlan = {
  id:string
  name:string
  description:string|null
  daily_kcal_target:number
  protein_target_g:number|null
  fat_target_g:number|null
  carbs_target_g:number|null
  notes:string|null
  version:number
  meals:ActiveNutritionMeal[]
}
