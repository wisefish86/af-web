import {describe,expect,it} from 'vitest'
import {canAbandonWorkout,nextSupersetRoundStarter,orderWorkoutSupersets,summarizeWorkoutCompletion,workoutStartedOnLocalDate} from '../src/features/workouts/state'

describe('workout completion state',()=>{
  it('counts only prescribed sets and cardio completion',()=>{
    const result=summarizeWorkoutCompletion(
      [
        {id:'a',prescribedSets:3,continuedFromWorkoutExerciseId:null},
        {id:'b',prescribedSets:2,continuedFromWorkoutExerciseId:null},
      ],
      {a:[1,2,3,4],b:[1]},
      [true,false],
    )
    expect(result).toEqual({
      plannedSetCount:5,
      completedPlannedSetCount:4,
      incompletePlannedSetCount:1,
      incompleteCardioCount:1,
      fullyComplete:false,
    })
  })

  it('does not double-count abandoned remainder after an exercise continuation',()=>{
    const result=summarizeWorkoutCompletion(
      [
        {id:'source',prescribedSets:3,continuedFromWorkoutExerciseId:null},
        {id:'continuation',prescribedSets:2,continuedFromWorkoutExerciseId:'source'},
      ],
      {source:[1],continuation:[1,2]},
      [],
    )
    expect(result.plannedSetCount).toBe(3)
    expect(result.completedPlannedSetCount).toBe(3)
    expect(result.fullyComplete).toBe(true)
  })

  it('does not let extra sets hide a missing prescribed set',()=>{
    const result=summarizeWorkoutCompletion(
      [{id:'a',prescribedSets:3,continuedFromWorkoutExerciseId:null}],
      {a:[1,2,4]},
      [],
    )
    expect(result.completedPlannedSetCount).toBe(2)
    expect(result.incompletePlannedSetCount).toBe(1)
  })
})


describe('workout local-day state',()=>{
  it('does not treat yesterday auto-completed workout as completed today',()=>{
    expect(workoutStartedOnLocalDate('2026-10-07T20:30:00.000Z','2026-10-08','Europe/Moscow')).toBe(false)
  })

  it('does treat a workout started today as completed today',()=>{
    expect(workoutStartedOnLocalDate('2026-10-08T20:30:00.000Z','2026-10-08','Europe/Moscow')).toBe(true)
  })
})


describe('superset execution state',()=>{
  it('starts the next round with the first exercise while both still have sets',()=>{
    expect(nextSupersetRoundStarter({nextRound:2,firstTotal:2,secondTotal:3})).toBe(1)
  })

  it('continues only the second exercise when the first has fewer sets',()=>{
    expect(nextSupersetRoundStarter({nextRound:3,firstTotal:2,secondTotal:3})).toBe(2)
  })

  it('stops when both exercises are complete',()=>{
    expect(nextSupersetRoundStarter({nextRound:4,firstTotal:2,secondTotal:3})).toBeNull()
  })
})

describe('empty workout cancellation',()=>{
  it('allows cancellation only before any saved result',()=>{
    expect(canAbandonWorkout({status:'in_progress',completedSetCount:0,completedCardioCount:0})).toBe(true)
    expect(canAbandonWorkout({status:'in_progress',completedSetCount:1,completedCardioCount:0})).toBe(false)
    expect(canAbandonWorkout({status:'in_progress',completedSetCount:0,completedCardioCount:1})).toBe(false)
    expect(canAbandonWorkout({status:'completed',completedSetCount:0,completedCardioCount:0})).toBe(false)
  })
})


describe('superset display ordering',()=>{
  it('keeps true partners together even when legacy sort order separated their rows',()=>{
    const ordered=orderWorkoutSupersets([
      {id:'upper',superset_group:2,superset_position:1},
      {id:'press',superset_group:1,superset_position:2},
      {id:'row',superset_group:1,superset_position:1},
      {id:'lateral',superset_group:2,superset_position:2},
    ])
    expect(ordered.map(item=>item.id)).toEqual(['upper','lateral','row','press'])
  })
})
