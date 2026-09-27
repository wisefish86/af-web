import { supabase } from '../../lib/supabase'

export type NotificationItem={
  id:string
  client_id:string
  recipient_id:string
  channel:string
  title:string|null
  body:string|null
  action_path:string|null
  status:string
  scheduled_for:string
  delivered_at:string|null
  read_at:string|null
  dismissed_at:string|null
  created_at:string
}

export type NotificationPreferences={
  user_id:string
  in_app_enabled:boolean
  telegram_enabled:boolean
  web_push_enabled:boolean
  quiet_hours_enabled:boolean
  quiet_start:string
  quiet_end:string
  timezone:string
  digest_mode:'immediate'|'morning_digest'|'evening_digest'
}

export async function loadNotificationPreferences():Promise<NotificationPreferences>{
  if(!supabase)throw new Error('Supabase не подключён')
  const {data,error}=await supabase.rpc('get_my_notification_preferences')
  if(error)throw error
  return data as NotificationPreferences
}

export async function saveNotificationPreferences(p:NotificationPreferences){
  if(!supabase)throw new Error('Supabase не подключён')
  const {error}=await supabase.from('notification_preferences').upsert({
    ...p,updated_at:new Date().toISOString(),
  },{onConflict:'user_id'})
  if(error)throw error
}

export async function loadNotifications(limit=50):Promise<NotificationItem[]>{
  if(!supabase)throw new Error('Supabase не подключён')
  const {data:auth,error:authError}=await supabase.auth.getUser()
  if(authError||!auth.user)throw authError??new Error('Нужно войти')
  const {data,error}=await supabase.from('notification_deliveries')
    .select('id,client_id,recipient_id,channel,title,body,action_path,status,scheduled_for,delivered_at,read_at,dismissed_at,created_at')
    .eq('recipient_id',auth.user.id)
    .is('dismissed_at',null)
    .order('created_at',{ascending:false})
    .limit(limit)
  if(error)throw error
  return data??[]
}

export async function loadUnreadNotificationCount():Promise<number>{
  if(!supabase)return 0
  const {data:auth}=await supabase.auth.getUser()
  if(!auth.user)return 0
  const {count,error}=await supabase.from('notification_deliveries')
    .select('id',{count:'exact',head:true})
    .eq('recipient_id',auth.user.id)
    .is('read_at',null)
    .is('dismissed_at',null)
  if(error)return 0
  return count??0
}

export async function markNotificationRead(id:string){
  if(!supabase)throw new Error('Supabase не подключён')
  const {error}=await supabase.rpc('mark_notification_read',{p_id:id})
  if(error)throw error
}

export async function markAllNotificationsRead(){
  if(!supabase)throw new Error('Supabase не подключён')
  const {error}=await supabase.rpc('mark_all_notifications_read')
  if(error)throw error
}

export async function dismissNotification(id:string){
  if(!supabase)throw new Error('Supabase не подключён')
  const {error}=await supabase.rpc('dismiss_notification',{p_id:id})
  if(error)throw error
}
