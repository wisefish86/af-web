import {describe,expect,it} from 'vitest'
import {chooseNutritionEditTarget} from '../src/features/nutrition/versioning'

describe('Meal Plan version edit decisions',()=>{
  it('resumes an existing draft before creating another revision',()=>{
    expect(chooseNutritionEditTarget([{id:'active',status:'active'},{id:'draft',status:'draft'}]))
      .toEqual({kind:'resume_draft',planId:'draft'})
  })

  it('creates a revision from active when no draft exists',()=>{
    expect(chooseNutritionEditTarget([{id:'active',status:'active'},{id:'old',status:'archived'}]))
      .toEqual({kind:'revise_active',planId:'active'})
  })

  it('creates a new plan when client has no draft or active plan',()=>{
    expect(chooseNutritionEditTarget([{id:'old',status:'archived'}])).toEqual({kind:'create_new'})
  })
})
