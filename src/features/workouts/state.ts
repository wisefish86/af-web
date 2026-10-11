import { appDateKey } from '../../lib/appDate'

export type WorkoutCompletionExerciseInput={
  id:string
  prescribedSets:number
  continuedFromWorkoutExerciseId:string|null
}

export type WorkoutCompletionSummary={
  plannedSetCount:number
  completedPlannedSetCount:number
  incompletePlannedSetCount:number
  incompleteCardioCount:number
  fullyComplete:boolean
}

export function summarizeWorkoutCompletion(
  exercises:WorkoutCompletionExerciseInput[],
  completedSetNumbersByExercise:Record<string,number[]>,
  cardioCompleted:boolean[],
):WorkoutCompletionSummary{
  const continuationSourceIds=new Set(
    exercises.map(item=>item.continuedFromWorkoutExerciseId).filter((id):id is string=>Boolean(id)),
  )
  const completedPrescribed=(exercise:WorkoutCompletionExerciseInput)=>{
    const numbers=new Set(completedSetNumbersByExercise[exercise.id]??[])
    let count=0
    for(let setNumber=1;setNumber<=exercise.prescribedSets;setNumber++){
      if(numbers.has(setNumber))count++
    }
    return count
  }
  const plannedSetCount=exercises.reduce(
    (sum,exercise)=>sum+(continuationSourceIds.has(exercise.id)?completedPrescribed(exercise):exercise.prescribedSets),
    0,
  )
  const completedPlannedSetCount=exercises.reduce((sum,exercise)=>sum+completedPrescribed(exercise),0)
  const incompletePlannedSetCount=Math.max(0,plannedSetCount-completedPlannedSetCount)
  const incompleteCardioCount=cardioCompleted.filter(done=>!done).length
  return {
    plannedSetCount,
    completedPlannedSetCount,
    incompletePlannedSetCount,
    incompleteCardioCount,
    fullyComplete:incompletePlannedSetCount===0&&incompleteCardioCount===0,
  }
}


export function workoutStartedOnLocalDate(startedAt:string,targetDateKey:string,timeZone:string){
  return appDateKey(new Date(startedAt),timeZone)===targetDateKey
}


export function nextSupersetRoundStarter(input:{
  nextRound:number
  firstTotal:number
  secondTotal:number
}):1|2|null{
  if(input.nextRound<=input.firstTotal)return 1
  if(input.nextRound<=input.secondTotal)return 2
  return null
}

export function canAbandonWorkout(input:{
  status:string
  completedSetCount:number
  completedCardioCount:number
}){
  return input.status==='in_progress'&&input.completedSetCount===0&&input.completedCardioCount===0
}
