import {describe,expect,it} from 'vitest'
import {detachProgramExerciseFromSuperset,moveProgramBlock,moveProgramItem,normalizeProgramSupersetAdjacency,pairProgramExercises,resolveTrainingProgramSaveMode,trainingProgramPayload,trainingProgramWarmups} from '../src/features/programs/model'
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

  it('creates and removes a superset without manual A1/A2 bookkeeping',()=>{
    const items=draft.sessions[0].items
    const paired=pairProgramExercises(items,'e1','c1')
    expect(paired).toBe(items)

    const exercise2={...items[0],local_id:'e2',exercise_id:'ex2'}
    const pairable=[items[0],exercise2,items[1]]
    const grouped=pairProgramExercises(pairable,'e2','e1')
    expect(grouped.map(item=>item.local_id)).toEqual(['e1','e2','c1'])
    expect(grouped[0].type==='exercise'&&grouped[0].superset_group).toBe(1)
    expect(grouped[0].type==='exercise'&&grouped[0].superset_position).toBe(1)
    expect(grouped[1].type==='exercise'&&grouped[1].superset_group).toBe(1)
    expect(grouped[1].type==='exercise'&&grouped[1].superset_position).toBe(2)

    const detached=detachProgramExerciseFromSuperset(grouped,'e2')
    expect(detached[0].type==='exercise'&&detached[0].superset_group).toBeNull()
    expect(detached[1].type==='exercise'&&detached[1].superset_group).toBeNull()
  })

  it('keeps different set counts for exercises in the same superset',()=>{
    const exercise1={...draft.sessions[0].items[0],local_id:'e1',exercise_id:'ex1',sets_min:2,sets_max:2}
    const exercise2={...draft.sessions[0].items[0],local_id:'e2',exercise_id:'ex2',sets_min:3,sets_max:3}
    const grouped=pairProgramExercises([exercise1,exercise2],'e2','e1')
    const nextDraft={...draft,sessions:[{...draft.sessions[0],items:grouped}]}
    const payload=trainingProgramPayload(nextDraft)
    const exercises=payload.sessions[0].items.filter(item=>item.type==='exercise')
    expect(exercises.map(item=>item.type==='exercise'?item.sets_min:null)).toEqual([2,3])
  })

  it('normalizes legacy non-adjacent superset members without changing their prescriptions',()=>{
    const base=draft.sessions[0].items[0]
    if(base.type!=='exercise')throw new Error('exercise fixture expected')
    const upper={...base,local_id:'upper',exercise_id:'upper',superset_group:2,superset_position:1 as const,sets_min:2,sets_max:2}
    const press={...base,local_id:'press',exercise_id:'press',superset_group:1,superset_position:2 as const,sets_min:3,sets_max:3}
    const row={...base,local_id:'row',exercise_id:'row',superset_group:1,superset_position:1 as const,sets_min:2,sets_max:2}
    const lateral={...base,local_id:'lateral',exercise_id:'lateral',superset_group:2,superset_position:2 as const,sets_min:3,sets_max:3}
    const normalized=normalizeProgramSupersetAdjacency([upper,press,row,lateral])
    expect(normalized.map(item=>item.local_id)).toEqual(['upper','lateral','row','press'])
    expect(normalized.filter(item=>item.type==='exercise').map(item=>item.sets_min)).toEqual([2,3,2,3])
  })

  it('reorders an exercise and safely dissolves its old superset',()=>{
    const exercise2={...draft.sessions[0].items[0],local_id:'e2',exercise_id:'ex2'}
    const exercise3={...draft.sessions[0].items[0],local_id:'e3',exercise_id:'ex3'}
    const grouped=pairProgramExercises([draft.sessions[0].items[0],exercise2,exercise3],'e2','e1')
    const moved=moveProgramItem(grouped,'e2','e3','after')
    expect(moved.map(item=>item.local_id)).toEqual(['e1','e3','e2'])
    expect(moved[0].type==='exercise'&&moved[0].superset_group).toBeNull()
    expect(moved[2].type==='exercise'&&moved[2].superset_group).toBeNull()
  })

  it('moves a whole superset as one block without dissolving it',()=>{
    const base=draft.sessions[0].items[0]
    if(base.type!=='exercise')throw new Error('exercise fixture expected')
    const e2={...base,local_id:'e2',exercise_id:'ex2'}
    const e3={...base,local_id:'e3',exercise_id:'ex3'}
    const e4={...base,local_id:'e4',exercise_id:'ex4'}
    const grouped=pairProgramExercises([base,e2,e3,e4],'e2','e1')
    const moved=moveProgramBlock(grouped,'e2','e4','after')
    expect(moved.map(item=>item.local_id)).toEqual(['e3','e4','e1','e2'])
    expect(moved.slice(2).map(item=>item.type==='exercise'?item.superset_group:null)).toEqual([1,1])
    expect(moved.slice(2).map(item=>item.type==='exercise'?item.superset_position:null)).toEqual([1,2])
  })

  it('drops a single exercise before an entire target superset',()=>{
    const base=draft.sessions[0].items[0]
    if(base.type!=='exercise')throw new Error('exercise fixture expected')
    const e2={...base,local_id:'e2',exercise_id:'ex2'}
    const e3={...base,local_id:'e3',exercise_id:'ex3'}
    const grouped=pairProgramExercises([base,e2,e3],'e2','e1')
    const moved=moveProgramBlock(grouped,'e3','e2','before')
    expect(moved.map(item=>item.local_id)).toEqual(['e3','e1','e2'])
  })
})
