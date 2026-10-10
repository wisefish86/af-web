export type NutritionPlanVersionSummary={id:string;status:string}

export function chooseNutritionEditTarget(plans:NutritionPlanVersionSummary[]):
  |{kind:'resume_draft';planId:string}
  |{kind:'revise_active';planId:string}
  |{kind:'create_new'}{
  const draft=plans.find(plan=>plan.status==='draft')
  if(draft)return {kind:'resume_draft',planId:draft.id}
  const active=plans.find(plan=>plan.status==='active')
  if(active)return {kind:'revise_active',planId:active.id}
  return {kind:'create_new'}
}
