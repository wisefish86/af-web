import {describe,expect,it} from 'vitest'
import {summarizeWorkoutCompletion} from '../src/features/workouts/state'

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
