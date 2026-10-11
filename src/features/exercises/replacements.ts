import type { Exercise } from './types'

export type ReplacementScope='recommended'|'all'

function overlap(a:string[],b:string[]){
  const right=new Set(b)
  return a.filter(value=>right.has(value)).length
}

function sharedGroups(source:Exercise,candidate:Exercise,scope:'specific'|'broad'){
  const candidateIds=new Set(candidate.substitution_groups.filter(group=>group.scope===scope).map(group=>group.id))
  return source.substitution_groups.filter(group=>group.scope===scope&&candidateIds.has(group.id))
}

export function exerciseReplacementScore(source:Exercise,candidate:Exercise){
  const specific=sharedGroups(source,candidate,'specific')
  const broad=sharedGroups(source,candidate,'broad')
  const primaryOverlap=overlap(source.primary_muscles,candidate.primary_muscles)
  const secondaryOverlap=overlap(source.secondary_muscles,candidate.secondary_muscles)

  let score=0
  if(specific.length){
    score+=1000
    const candidateMembership=candidate.substitution_groups
      .filter(group=>specific.some(shared=>shared.id===group.id))
      .sort((a,b)=>a.priority-b.priority)[0]
    score+=candidateMembership?.match_type==='direct'?220:candidateMembership?.match_type==='acceptable'?140:60
    score+=Math.max(0,100-(candidateMembership?.priority??100))
  }
  if(broad.length)score+=160
  score+=primaryOverlap*180
  score+=secondaryOverlap*35
  if(source.movement_pattern_code&&source.movement_pattern_code===candidate.movement_pattern_code)score+=150
  if(source.exercise_type===candidate.exercise_type)score+=40
  if(source.equipment_code&&source.equipment_code===candidate.equipment_code)score+=30
  if(source.is_unilateral===candidate.is_unilateral)score+=10
  return score
}

export function isRecommendedReplacement(source:Exercise,candidate:Exercise){
  if(source.id===candidate.id||!candidate.is_active)return false
  const sourceSpecific=source.substitution_groups.filter(group=>group.scope==='specific')
  if(sourceSpecific.length>0)return sharedGroups(source,candidate,'specific').length>0
  const primaryOverlap=overlap(source.primary_muscles,candidate.primary_muscles)>0
  return primaryOverlap&&Boolean(source.movement_pattern_code)&&source.movement_pattern_code===candidate.movement_pattern_code
}

export function rankExerciseReplacements(source:Exercise,exercises:Exercise[],scope:ReplacementScope='recommended'){
  return exercises
    .filter(candidate=>candidate.id!==source.id&&candidate.is_active&&(scope==='all'||isRecommendedReplacement(source,candidate)))
    .map(candidate=>({exercise:candidate,score:exerciseReplacementScore(source,candidate)}))
    .sort((a,b)=>b.score-a.score||a.exercise.name.localeCompare(b.exercise.name,'ru'))
    .map(item=>item.exercise)
}

export function replacementReason(source:Exercise,candidate:Exercise){
  const specific=sharedGroups(source,candidate,'specific')
  if(specific.length)return specific[0].name
  if(source.movement_pattern_code&&source.movement_pattern_code===candidate.movement_pattern_code&&overlap(source.primary_muscles,candidate.primary_muscles)>0){
    return 'То же движение и основная мышца'
  }
  if(sharedGroups(source,candidate,'broad').length)return 'Та же группа мышц'
  return null
}
