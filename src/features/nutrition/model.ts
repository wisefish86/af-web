import type {NutritionMealDraft,NutritionMealItemDraft,NutritionMealVariantDraft} from './types'

export function kcal(item:NutritionMealItemDraft){return item.grams*item.kcal_100/100}

export function macros(item:NutritionMealItemDraft){
  const factor=item.grams/100
  return {
    kcal:kcal(item),
    protein:item.protein_100*factor,
    fat:item.fat_100*factor,
    carbs:item.carbs_100*factor,
  }
}

export function variantTotals(variant:NutritionMealVariantDraft){
  return variant.items.reduce((total,item)=>{
    const value=macros(item)
    return {
      kcal:total.kcal+value.kcal,
      protein:total.protein+value.protein,
      fat:total.fat+value.fat,
      carbs:total.carbs+value.carbs,
    }
  },{kcal:0,protein:0,fat:0,carbs:0})
}

export function scaleVariant(variant:NutritionMealVariantDraft,target:number):NutritionMealVariantDraft{
  const fixed=variant.items.filter(item=>item.is_fixed).reduce((sum,item)=>sum+kcal(item),0)
  const flexible=variant.items.filter(item=>!item.is_fixed).reduce((sum,item)=>sum+kcal(item),0)
  if(flexible<=0)return variant
  const factor=Math.max(0,(target-fixed)/flexible)
  return {
    ...variant,
    items:variant.items.map(item=>item.is_fixed?item:{...item,grams:Math.max(1,Math.round(item.grams*factor))}),
  }
}

export function scaleMeal(meal:NutritionMealDraft,target=meal.kcal_target):NutritionMealDraft{
  return {...meal,kcal_target:target,variants:meal.variants.map(variant=>scaleVariant(variant,target))}
}

export function distribute(
  meals:NutritionMealDraft[],
  daily:number,
  changedId?:string,
  changedTarget?:number,
){
  const base=meals.map(meal=>changedId===meal.local_id
    ? {...meal,kcal_target:Math.max(0,Math.round(changedTarget??meal.kcal_target))}
    : meal)
  const fixed=base.filter(meal=>meal.target_locked||meal.local_id===changedId)
  const flexible=base.filter(meal=>!fixed.includes(meal))
  if(!flexible.length)return base.map(meal=>scaleMeal(meal))
  const remaining=Math.max(0,daily-fixed.reduce((sum,meal)=>sum+meal.kcal_target,0))
  const weight=flexible.reduce((sum,meal)=>sum+Math.max(1,meal.kcal_target),0)
  let assigned=0
  return base.map(meal=>{
    if(fixed.includes(meal))return scaleMeal(meal)
    const index=flexible.indexOf(meal)
    const target=index===flexible.length-1
      ? remaining-assigned
      : Math.round(remaining*Math.max(1,meal.kcal_target)/weight)
    assigned+=Math.max(0,target)
    return scaleMeal(meal,Math.max(0,target))
  })
}
