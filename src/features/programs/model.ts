import type {TrainingProgramDraft} from './types'

export function trainingProgramPayload(draft:TrainingProgramDraft){
  return {
    client_id:draft.client_id||null,
    name:draft.name.trim(),
    description:draft.description.trim()||null,
    weekly_frequency:draft.weekly_frequency,
    is_template:draft.is_template,
    sessions:draft.sessions.map(session=>({
      name:session.name.trim(),
      session_type:session.session_type,
      planned_duration_minutes:session.planned_duration_minutes,
      notes:session.notes.trim()||null,
      items:session.items.map(item=>item.type==='exercise'?{
        type:'exercise',
        exercise_id:item.exercise_id,
        substitution_group_id:item.substitution_group_id||null,
        exercise_role:item.exercise_role,
        sets_min:item.sets_min,
        sets_max:item.sets_max,
        reps_min:item.reps_min,
        reps_max:item.reps_max,
        rir_enabled:item.rir_enabled,
        rir_min:item.rir_enabled?item.rir_min:null,
        rir_max:item.rir_enabled?item.rir_max:null,
        rest_seconds:item.rest_seconds,
        allow_client_substitution:item.allow_client_substitution,
        substitution_policy:item.substitution_policy,
        notes:item.notes.trim()||null,
        progression_notes:item.progression_notes.trim()||null,
        superset_group:item.superset_group,
        superset_position:item.superset_position,
      }:{
        type:'cardio',
        modality_code:item.modality_code,
        name:item.name.trim()||null,
        duration_minutes:item.duration_minutes,
        target_hr_min:item.target_hr_min,
        target_hr_max:item.target_hr_max,
        target_rpe_min:item.target_rpe_min,
        target_rpe_max:item.target_rpe_max,
        speed_kmh:item.speed_kmh,
        incline_percent:item.incline_percent,
        distance_km:item.distance_km,
        notes:item.notes.trim()||null,
      }),
    })),
  }
}

export function trainingProgramWarmups(draft:TrainingProgramDraft){
  return draft.sessions.flatMap((session,sessionIndex)=>
    session.items.map((item,itemIndex)=>({item,itemIndex})).flatMap(({item,itemIndex})=>
      item.type==='exercise'?[{
        day_index:sessionIndex+1,
        sort_order:(itemIndex+1)*10,
        warmup_enabled:item.warmup_enabled,
        warmup_load_percent_min:item.warmup_load_percent_min,
        warmup_load_percent_max:item.warmup_load_percent_max,
        warmup_reps_min:item.warmup_reps_min,
        warmup_reps_max:item.warmup_reps_max,
        warmup_rest_seconds:item.warmup_rest_seconds,
        warmup_notes:item.warmup_notes.trim()||null,
      }]:[]
    )
  )
}

export function resolveTrainingProgramSaveMode(input:{
  published:boolean
  savedProgramId:string|null
  revisionSourceId:string|null
}){
  const revisionBaseId=input.published&&input.savedProgramId
    ? input.savedProgramId
    : !input.savedProgramId?input.revisionSourceId:null
  const replacingDraftId=!input.published?input.savedProgramId:null
  return {
    revisionBaseId,
    replacingDraftId,
    creatingRevision:Boolean(revisionBaseId&&!replacingDraftId),
  }
}
