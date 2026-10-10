import {describe,expect,it} from 'vitest'
import {resolveTrainingProgramSaveMode,trainingProgramPayload,trainingProgramWarmups} from '../src/features/programs/model'
import type {TrainingProgramDraft} from '../src/features/programs/types'

const draft:TrainingProgramDraft={
  client_id:'client-1',
  name:'  Full Body  ',
  description:'  plan  ',
  weekly_frequency:3,
  is_template:false,
  sessions:[{
    local_id:'s1',name:'  День 1 ',session_type:'mixed',planned_duration_minutes:70,notes:'  note ',
    items:[
      {
        local_id:'e1',type:'exercise',exercise_id:'ex1',substitution_group_id:'',exercise_role:'main',
        sets_min:3,sets_max:3,reps_min:8,reps_max:12,rir_enabled:false,rir_min:1,rir_max:2,rest_seconds:120,
        warmup_enabled:true,warmup_load_percent_min:50,warmup_load_percent_max:60,warmup_reps_min:8,warmup_reps_max:10,
        warmup_rest_seconds:60,warmup_notes:'  warm ',allow_client_substitution:false,substitution_policy:'strict',
        notes:'  cue ',progression_notes:'  progress ',superset_group:null,superset_position:null,
      },
      {
        local_id:'c1',type:'cardio',modality_code:'walking',name:'  Easy ',duration_minutes:20,
        target_hr_min:null,target_hr_max:null,target_rpe_min:3,target_rpe_max:4,speed_kmh:null,incline_percent:null,
        distance_km:null,notes:'  cardio ',
      },
    ],
  }],
}

describe('training program model',()=>{
  it('normalizes payload and removes disabled RIR targets',()=>{
    const payload=trainingProgramPayload(draft)
    expect(payload.name).toBe('Full Body')
    expect(payload.description).toBe('plan')
    expect(payload.sessions[0].name).toBe('День 1')
    const exercise=payload.sessions[0].items[0]
    expect(exercise.type).toBe('exercise')
    if(exercise.type==='exercise'){
      expect(exercise.rir_min).toBeNull()
      expect(exercise.rir_max).toBeNull()
      expect(exercise.notes).toBe('cue')
    }
  })

  it('keeps warmup coordinates aligned with mixed session ordering',()=>{
    expect(trainingProgramWarmups(draft)).toEqual([{
      day_index:1,sort_order:10,warmup_enabled:true,warmup_load_percent_min:50,warmup_load_percent_max:60,
      warmup_reps_min:8,warmup_reps_max:10,warmup_rest_seconds:60,warmup_notes:'warm',
    }])
  })

  it('chooses update vs revision modes deterministically',()=>{
    expect(resolveTrainingProgramSaveMode({published:false,savedProgramId:'draft-1',revisionSourceId:null}))
      .toEqual({revisionBaseId:null,replacingDraftId:'draft-1',creatingRevision:false})
    expect(resolveTrainingProgramSaveMode({published:true,savedProgramId:'active-1',revisionSourceId:'active-1'}))
      .toEqual({revisionBaseId:'active-1',replacingDraftId:null,creatingRevision:true})
    expect(resolveTrainingProgramSaveMode({published:false,savedProgramId:null,revisionSourceId:'active-1'}))
      .toEqual({revisionBaseId:'active-1',replacingDraftId:null,creatingRevision:true})
  })
})
