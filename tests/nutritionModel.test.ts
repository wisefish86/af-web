import {describe,expect,it} from 'vitest'
import {distribute,scaleVariant,variantTotals} from '../src/features/nutrition/model'
import type {NutritionMealDraft,NutritionMealItemDraft} from '../src/features/nutrition/types'

const item=(id:string,grams:number,kcal100:number,fixed=false):NutritionMealItemDraft=>({
  local_id:id,food_id:id,client_food_id:null,name:id,grams,kcal_100:kcal100,protein_100:10,fat_100:5,carbs_100:20,is_fixed:fixed,notes:'',
})
const meal=(id:string,target:number,locked=false):NutritionMealDraft=>({
  local_id:id,name:id,meal_type:'main',kcal_target:target,target_locked:locked,notes:'',
  variants:[{local_id:id+'v',name:'main',is_default:true,notes:'',items:[item(id+'i',100,100)]}],
})

describe('nutrition allocation model',()=>{
  it('distributes the daily budget exactly across flexible meal targets',()=>{
    const result=distribute([meal('a',600),meal('b',900),meal('c',500)],2300)
    expect(result.reduce((sum,value)=>sum+value.kcal_target,0)).toBe(2300)
  })

  it('keeps a locked target and distributes only the remainder',()=>{
    const result=distribute([meal('a',650,true),meal('b',900),meal('c',500)],2300)
    expect(result[0].kcal_target).toBe(650)
    expect(result.slice(1).reduce((sum,value)=>sum+value.kcal_target,0)).toBe(1650)
  })

  it('keeps fixed food grams unchanged while scaling flexible food',()=>{
    const variant={local_id:'v',name:'v',is_default:true,notes:'',items:[item('fixed',100,200,true),item('flex',100,100,false)]}
    const scaled=scaleVariant(variant,400)
    expect(scaled.items[0].grams).toBe(100)
    expect(scaled.items[1].grams).toBe(200)
    expect(variantTotals(scaled).kcal).toBe(400)
  })
})
