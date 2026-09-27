import { supabase } from '../../lib/supabase'
import type { FeedbackStatus, FeedbackThread } from './types'

export async function loadTrainerInbox(): Promise<FeedbackThread[]> {
  if (!supabase) throw new Error('Supabase не подключён')

  const { data: threads, error } = await supabase
    .from('feedback_threads')
    .select('id, client_id, workout_exercise_id, status, created_at, updated_at')
    .order('updated_at',{ascending:false})
  if (error) throw error
  if (!threads?.length) return []

  const clientIds=[...new Set(threads.map(t=>t.client_id))]
  const workoutExerciseIds=[...new Set(threads.map(t=>t.workout_exercise_id).filter(Boolean))] as string[]
  const threadIds=threads.map(t=>t.id)

  const [profilesRes, workoutExerciseRes, messagesRes] = await Promise.all([
    supabase.from('profiles').select('id, display_name').in('id',clientIds),
    workoutExerciseIds.length
      ? supabase.from('workout_exercises').select('id, exercise_id').in('id',workoutExerciseIds)
      : Promise.resolve({data:[],error:null}),
    supabase.from('feedback_messages').select('id, thread_id, author_id, body, created_at').in('thread_id',threadIds).order('created_at'),
  ])
  const combinedError=profilesRes.error || workoutExerciseRes.error || messagesRes.error
  if (combinedError) throw combinedError

  const exerciseIds=[...new Set((workoutExerciseRes.data ?? []).map(row=>row.exercise_id))]
  const { data: exerciseRows, error: exerciseError } = exerciseIds.length
    ? await supabase.from('exercises').select('id, name').in('id',exerciseIds)
    : {data:[],error:null}
  if (exerciseError) throw exerciseError

  const clientName=new Map((profilesRes.data ?? []).map(row=>[row.id,row.display_name]))
  const workoutExerciseToExercise=new Map((workoutExerciseRes.data ?? []).map(row=>[row.id,row.exercise_id]))
  const exerciseName=new Map((exerciseRows ?? []).map(row=>[row.id,row.name]))
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
  if (error) throw error
}

export async function replyToFeedback(threadId:string,body:string) {
  if (!supabase) throw new Error('Supabase не подключён')
  const { data: authData,error:authError }=await supabase.auth.getUser()
  if (authError || !authData.user) throw authError ?? new Error('Нужно войти как тренер')

  const text=body.trim()
  if (!text) return

  const { error:messageError }=await supabase
    .from('feedback_messages')
    .insert({thread_id:threadId,author_id:authData.user.id,body:text})
  if (messageError) throw messageError

  const { error:threadError }=await supabase
    .from('feedback_threads')
    .update({
      status:'in_progress',
      assigned_to:authData.user.id,
      resolved_at:null,
      updated_at:new Date().toISOString(),
    })
    .eq('id',threadId)
  if (threadError) throw threadError
}
