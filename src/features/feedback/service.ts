import { getVerifiedUser, supabase } from '../../lib/supabase'
import type { FeedbackStatus, FeedbackThread } from './types'

export async function loadTrainerInbox(): Promise<FeedbackThread[]> {
  if (!supabase) throw new Error('Supabase не подключён')

  const { data: threads, error } = await supabase
    .from('feedback_threads')
    .select('id, client_id, workout_session_id, workout_exercise_id, context_type, context_key, context_label, status, created_at, updated_at')
    .order('updated_at',{ascending:false})
  if (error) throw error
  if (!threads?.length) return []

  const clientIds=[...new Set(threads.map(t=>t.client_id))]
  const workoutExerciseIds=[...new Set(threads.map(t=>t.workout_exercise_id).filter(Boolean))] as string[]
  const threadIds=threads.map(t=>t.id)

  const [profilesRes,workoutExerciseRes,messagesRes]=await Promise.all([
    supabase.from('profiles').select('id, display_name').in('id',clientIds),
    workoutExerciseIds.length
      ? supabase.from('workout_exercises').select('id, exercise_id').in('id',workoutExerciseIds)
      : Promise.resolve({data:[],error:null}),
    supabase.from('feedback_messages').select('id, thread_id, author_id, body, created_at').in('thread_id',threadIds).order('created_at'),
  ])
  if(messagesRes.error)throw messagesRes.error

  const workoutExerciseRows=workoutExerciseRes.error?[]:(workoutExerciseRes.data??[])
  const profileRows=profilesRes.error?[]:(profilesRes.data??[])
  const exerciseIds=[...new Set(workoutExerciseRows.map(row=>row.exercise_id))]
  const {data:exerciseData,error:exerciseError}=exerciseIds.length
    ? await supabase.from('exercises').select('id, name').in('id',exerciseIds)
    : {data:[],error:null}
  const exerciseRows=exerciseError?[]:(exerciseData??[])

  const clientName=new Map(profileRows.map(row=>[row.id,row.display_name]))
  const workoutExerciseToExercise=new Map(workoutExerciseRows.map(row=>[row.id,row.exercise_id]))
  const exerciseName=new Map(exerciseRows.map(row=>[row.id,row.name]))
  const messagesByThread=new Map<string,FeedbackThread['messages']>()
  for (const message of messagesRes.data ?? []) {
    const list=messagesByThread.get(message.thread_id) ?? []
    list.push({id:message.id,author_id:message.author_id,body:message.body,created_at:message.created_at})
    messagesByThread.set(message.thread_id,list)
  }

  return threads.map(thread=>{
    const exerciseId=thread.workout_exercise_id ? workoutExerciseToExercise.get(thread.workout_exercise_id) : null
    return {
      id:thread.id,
      client_id:thread.client_id,
      client_name:clientName.get(thread.client_id) ?? 'Клиент',
      workout_exercise_id:thread.workout_exercise_id,
      workout_session_id:thread.workout_session_id,
      context_type:thread.context_type,
      context_key:thread.context_key,
      context_label:thread.context_label,
      exercise_name:exerciseId ? exerciseName.get(exerciseId) ?? 'Упражнение' : null,
      status:thread.status as FeedbackStatus,
      created_at:thread.created_at,
      updated_at:thread.updated_at,
      messages:messagesByThread.get(thread.id) ?? [],
    }
  })
}

export async function updateFeedbackStatus(threadId:string,status:FeedbackStatus) {
  if (!supabase) throw new Error('Supabase не подключён')
  const { data: authData,error:authError }=await supabase.auth.getUser()
  if (authError || !authData.user) throw authError ?? new Error('Нужно войти как тренер')

  const { error }=await supabase
    .from('feedback_threads')
    .update({
      status,
      assigned_to:status==='resolved'?authData.user.id:authData.user.id,
      resolved_at:status==='resolved'?new Date().toISOString():null,
      updated_at:new Date().toISOString(),
    })
    .eq('id',threadId)
    .select('id')
    .single()
  if (error) throw error
}

export async function replyToFeedback(threadId:string,body:string,requestId:string=crypto.randomUUID()) {
  if (!supabase) throw new Error('Supabase не подключён')
  const text=body.trim()
  if(!text)return
  const {error}=await supabase.rpc('reply_to_feedback_v2',{p_thread_id:threadId,p_body:text,p_request_id:requestId})
  if(error)throw error
}

export function subscribeToFeedbackThread(threadId:string,onChange:()=>void){
  if(!supabase)return()=>{}
  const channel=supabase.channel('feedback-thread:'+threadId+':'+crypto.randomUUID())
    .on('postgres_changes',{event:'*',schema:'public',table:'feedback_messages',filter:'thread_id=eq.'+threadId},()=>onChange())
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'feedback_threads',filter:'id=eq.'+threadId},()=>onChange())
    .subscribe()
  return()=>{void supabase?.removeChannel(channel)}
}

export function subscribeToTrainerFeedback(onChange:()=>void){
  if(!supabase)return()=>{}
  const channel=supabase.channel('trainer-feedback:'+crypto.randomUUID())
    .on('postgres_changes',{event:'*',schema:'public',table:'feedback_messages'},()=>onChange())
    .on('postgres_changes',{event:'*',schema:'public',table:'feedback_threads'},()=>onChange())
    .subscribe()
  return()=>{void supabase?.removeChannel(channel)}
}


export async function loadMyWorkoutFeedback(workoutExerciseId:string):Promise<FeedbackThread|null>{
  if(!supabase)throw new Error('Supabase не подключён')
  const authUser=await getVerifiedUser()

  const {data:thread,error:threadError}=await supabase
    .from('feedback_threads')
    .select('id,client_id,workout_session_id,workout_exercise_id,context_type,context_key,context_label,status,created_at,updated_at')
    .eq('client_id',authUser.id)
    .eq('workout_exercise_id',workoutExerciseId)
    .order('created_at',{ascending:false})
    .limit(1)
    .maybeSingle()
  if(threadError)throw threadError
  if(!thread)return null

  const {data:messages,error:messagesError}=await supabase
    .from('feedback_messages')
    .select('id,author_id,body,created_at')
    .eq('thread_id',thread.id)
    .order('created_at')
  if(messagesError)throw messagesError

  return {
    id:thread.id,
    client_id:thread.client_id,
    client_name:'Вы',
    workout_exercise_id:thread.workout_exercise_id,
    workout_session_id:thread.workout_session_id,
    context_type:thread.context_type,
    context_key:thread.context_key,
    context_label:thread.context_label,
    exercise_name:null,
    status:thread.status as FeedbackStatus,
    created_at:thread.created_at,
    updated_at:thread.updated_at,
    messages:(messages??[]).map(message=>({
      id:message.id,
      author_id:message.author_id,
      body:message.body,
      created_at:message.created_at,
    })),
  }
}


export async function loadMyFeedbackThread(threadId:string):Promise<FeedbackThread|null>{
  if(!supabase)throw new Error('Supabase не подключён')
  const authUser=await getVerifiedUser()

  const {data:thread,error:threadError}=await supabase
    .from('feedback_threads')
    .select('id,client_id,workout_session_id,workout_exercise_id,context_type,context_key,context_label,status,created_at,updated_at')
    .eq('id',threadId)
    .eq('client_id',authUser.id)
    .maybeSingle()
  if(threadError)throw threadError
  if(!thread)return null

  const {data:messages,error:messagesError}=await supabase
    .from('feedback_messages')
    .select('id,author_id,body,created_at')
    .eq('thread_id',thread.id)
    .order('created_at')
  if(messagesError)throw messagesError

  return {
    id:thread.id,
    client_id:thread.client_id,
    client_name:'Вы',
    workout_exercise_id:thread.workout_exercise_id,
    workout_session_id:thread.workout_session_id,
    context_type:thread.context_type,
    context_key:thread.context_key,
    context_label:thread.context_label,
    exercise_name:null,
    status:thread.status as FeedbackStatus,
    created_at:thread.created_at,
    updated_at:thread.updated_at,
    messages:(messages??[]).map(message=>({
      id:message.id,
      author_id:message.author_id,
      body:message.body,
      created_at:message.created_at,
    })),
  }
}
