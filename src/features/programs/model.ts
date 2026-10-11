import type {ProgramExerciseItem,ProgramItem,TrainingProgramDraft} from './types'

function isExercise(item:ProgramItem):item is ProgramExerciseItem{
  return item.type==='exercise'
}

function clearSuperset(item:ProgramItem):ProgramItem{
  return isExercise(item)?{...item,superset_group:null,superset_position:null}:item
}

function normalizeSupersetOrphans(items:ProgramItem[]){
  const counts=new Map<number,number>()
  items.forEach(item=>{
    if(isExercise(item)&&item.superset_group!=null)counts.set(item.superset_group,(counts.get(item.superset_group)??0)+1)
  })
  return items.map(item=>
    isExercise(item)&&item.superset_group!=null&&(counts.get(item.superset_group)??0)<2
      ? clearSuperset(item)
      : item
  )
}

function nextSupersetGroup(items:ProgramItem[]){
  return items.reduce((max,item)=>isExercise(item)&&item.superset_group!=null?Math.max(max,item.superset_group):max,0)+1
}

export function normalizeProgramSupersetAdjacency(items:ProgramItem[]){
  const groups=new Map<number,ProgramExerciseItem[]>()
  for(const item of items){
    if(isExercise(item)&&item.superset_group!=null){
      const members=groups.get(item.superset_group)??[]
      members.push(item)
      groups.set(item.superset_group,members)
    }
  }

  const validGroups=new Set<number>()
  for(const [group,members] of groups){
    const positions=new Set(members.map(item=>item.superset_position))
    if(members.length===2&&positions.has(1)&&positions.has(2))validGroups.add(group)
  }

  const emitted=new Set<number>()
  const output:ProgramItem[]=[]
  for(const item of items){
    if(!isExercise(item)||item.superset_group==null){
      output.push(item)
      continue
    }
    const group=item.superset_group
    if(!validGroups.has(group)){
      output.push(clearSuperset(item))
      continue
    }
    if(emitted.has(group))continue
    emitted.add(group)
    const members=(groups.get(group)??[])
      .slice()
      .sort((a,b)=>(a.superset_position??99)-(b.superset_position??99))
    output.push(...members)
  }
  return output
}

export function detachProgramExerciseFromSuperset(items:ProgramItem[],localId:string){
  const source=items.find(item=>item.local_id===localId)
  if(!source||!isExercise(source)||source.superset_group==null)return items
  return normalizeSupersetOrphans(items.map(item=>item.local_id===localId?clearSuperset(item):item))
}

export function pairProgramExercises(items:ProgramItem[],sourceId:string,targetId:string){
  if(sourceId===targetId)return items
  const source=items.find(item=>item.local_id===sourceId)
  const target=items.find(item=>item.local_id===targetId)
  if(!source||!target||!isExercise(source)||!isExercise(target))return items

  const targetGroup=target.superset_group
  if(targetGroup!=null){
    const members=items.filter(item=>isExercise(item)&&item.superset_group===targetGroup)
    if(members.length>=2&&!members.some(item=>item.local_id===sourceId))return items
  }

  let next=detachProgramExerciseFromSuperset(items,sourceId)
  const refreshedTarget=next.find(item=>item.local_id===targetId)
  if(!refreshedTarget||!isExercise(refreshedTarget))return items

  const group=refreshedTarget.superset_group??nextSupersetGroup(next)
  if(refreshedTarget.superset_group==null){
    next=next.map(item=>item.local_id===targetId&&isExercise(item)
      ? {...item,superset_group:group,superset_position:1}
      : item)
  }
  next=next.map(item=>item.local_id===sourceId&&isExercise(item)
    ? {...item,superset_group:group,superset_position:2}
    : item)

  const sourceIndex=next.findIndex(item=>item.local_id===sourceId)
  const targetIndex=next.findIndex(item=>item.local_id===targetId)
  if(sourceIndex<0||targetIndex<0)return next
  const [moved]=next.splice(sourceIndex,1)
  const refreshedTargetIndex=next.findIndex(item=>item.local_id===targetId)
  next.splice(refreshedTargetIndex+1,0,moved)
  return next
}

export function moveProgramItem(items:ProgramItem[],sourceId:string,targetId:string,placement:'before'|'after'){
  if(sourceId===targetId)return items
  const sourceIndex=items.findIndex(item=>item.local_id===sourceId)
  const targetIndex=items.findIndex(item=>item.local_id===targetId)
  if(sourceIndex<0||targetIndex<0)return items

  const source=items[sourceIndex]
  let next=detachProgramExerciseFromSuperset(items,sourceId)
  const detachedSourceIndex=next.findIndex(item=>item.local_id===sourceId)
  const [moved]=next.splice(detachedSourceIndex,1)
  const refreshedTargetIndex=next.findIndex(item=>item.local_id===targetId)
  if(refreshedTargetIndex<0)return items
  const insertAt=placement==='before'?refreshedTargetIndex:refreshedTargetIndex+1
  next.splice(insertAt,0,moved??source)
  return normalizeSupersetOrphans(next)
}

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
      items:normalizeProgramSupersetAdjacency(session.items).map(item=>item.type==='exercise'?{
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
    normalizeProgramSupersetAdjacency(session.items).map((item,itemIndex)=>({item,itemIndex})).flatMap(({item,itemIndex})=>
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
