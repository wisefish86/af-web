export type FeedbackStatus = 'new' | 'in_progress' | 'resolved'

export type FeedbackMessage = {
  id: string
  author_id: string
  body: string
  created_at: string
}

export type FeedbackThread = {
  id: string
  client_id: string
  client_name: string
  workout_exercise_id: string | null
  workout_session_id?: string | null
  context_type?: string | null
  context_key?: string | null
  context_label?: string | null
  exercise_name: string | null
  status: FeedbackStatus
  created_at: string
  updated_at: string
  messages: FeedbackMessage[]
}
