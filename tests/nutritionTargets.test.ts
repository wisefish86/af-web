import { describe,expect,it } from 'vitest'
import { nutritionTargetHints, type NutritionTargets } from '../src/features/nutrition/service'

const targets:NutritionTargets={
  id:'t',valid_from:'2026-10-01',calories_target:2300,calorie_tolerance:100,
  protein_target_g:146,fat_min_g:55,fat_max_g:92,carbs_target_g:null,
}

describe('nutrition target hints',()=>{
  it('derives warnings from facts instead of storing hint text',()=>{
    expect(nutritionTargetHints({calories:2009,protein_g:102.6,fat_g:49.7,carbs_g:292.31},targets))
      .toEqual(['Калорий ниже ориентира','Белка маловато','Жиров маловато'])
  })

  it('does not invent a carbs warning without an explicit target',()=>{
    expect(nutritionTargetHints({calories:2300,protein_g:150,fat_g:70,carbs_g:500},targets)).toEqual([])
  })
})
