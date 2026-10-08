import { getVerifiedUser, supabase } from '../../lib/supabase'
import { makeReminderPreset, reminderWeekdaysIssue } from './reminderModel'

function notifyChanged(){if(typeof window!=='undefined')window.dispatchEvent(new Event('notifications:changed'))}

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
  payload?:Record<string,unknown>|null
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

export type NotificationTopicCode='feedback'|'workouts'|'progress'|'nutrition'|'checkins'|'general'
export type NotificationTopicPreferences=Record<NotificationTopicCode,boolean>

export const defaultNotificationTopicPreferences:NotificationTopicPreferences={
  feedback:true,
  workouts:true,
  progress:true,
  nutrition:true,
  checkins:true,
  general:true,
}

export async function loadNotificationTopicPreferences(channel:'telegram'|'web_push'='telegram'):Promise<NotificationTopicPreferences>{
  if(!supabase)throw new Error('Supabase не подключён')
  const authUser=await getVerifiedUser()
  const {data,error}=await supabase.from('notification_channel_topic_preferences')
    .select('topic_code,enabled')
    .eq('user_id',authUser.id)
    .eq('channel',channel)
  if(error)throw error
  const next={...defaultNotificationTopicPreferences}
  for(const row of data??[]){
    const key=row.topic_code as NotificationTopicCode
    if(key in next)next[key]=Boolean(row.enabled)
  }
  return next
}

export async function saveNotificationTopicPreference(
  topic:NotificationTopicCode,
  enabled:boolean,
  channel:'telegram'|'web_push'='telegram',
):Promise<void>{
  if(!supabase)throw new Error('Supabase не подключён')
  const authUser=await getVerifiedUser()
  const {error}=await supabase.from('notification_channel_topic_preferences').upsert({
    user_id:authUser.id,channel,topic_code:topic,enabled,updated_at:new Date().toISOString(),
  },{onConflict:'user_id,channel,topic_code'})
  if(error)throw error
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

export async function setMyTelegramNotificationsEnabled(enabled:boolean){
  const current=await loadNotificationPreferences()
  await saveNotificationPreferences({...current,telegram_enabled:enabled})
}

export async function loadNotifications(limit=50):Promise<NotificationItem[]>{
  if(!supabase)throw new Error('Supabase не подключён')
  const authUser=await getVerifiedUser()
  const {data,error}=await supabase.from('notification_deliveries')
    .select('id,client_id,recipient_id,channel,title,body,action_path,status,scheduled_for,delivered_at,read_at,dismissed_at,created_at,payload')
    .eq('recipient_id',authUser.id)
    .eq('channel','in_app')
    .eq('status','sent')
    .not('delivered_at','is',null)
    .is('dismissed_at',null)
    .order('created_at',{ascending:false})
    .limit(limit)
  if(error)throw error
  return data??[]
}

export async function loadUnreadNotificationCount():Promise<number>{
  if(!supabase)return 0
  let authUser
  try{authUser=await getVerifiedUser()}catch{return 0}
  const {count,error}=await supabase.from('notification_deliveries')
    .select('id',{count:'exact',head:true})
    .eq('recipient_id',authUser.id)
    .eq('channel','in_app')
    .eq('status','sent')
    .not('delivered_at','is',null)
    .is('read_at',null)
    .is('dismissed_at',null)
  if(error)return 0
  return count??0
}

export async function subscribeToMyNotifications(onChange:()=>void):Promise<()=>void>{
  if(!supabase)return()=>{}
  let authUser
  try{authUser=await getVerifiedUser()}catch{return()=>{}}
  const channel=supabase.channel('my-notifications:'+authUser.id+':'+crypto.randomUUID())
    .on('postgres_changes',{
      event:'*',schema:'public',table:'notification_deliveries',
      filter:'recipient_id=eq.'+authUser.id,
    },()=>onChange())
    .subscribe()
  return()=>{void supabase?.removeChannel(channel)}
}

export async function markNotificationRead(id:string){
  if(!supabase)throw new Error('Supabase не подключён')
  const {error}=await supabase.rpc('mark_notification_read',{p_id:id})
  if(error)throw error
  notifyChanged()
}

export async function markAllNotificationsRead(){
  if(!supabase)throw new Error('Supabase не подключён')
  const {error}=await supabase.rpc('mark_all_notifications_read')
  if(error)throw error
  notifyChanged()
}

export async function dismissNotification(id:string){
  if(!supabase)throw new Error('Supabase не подключён')
  const {error}=await supabase.rpc('dismiss_notification',{p_id:id})
  if(error)throw error
  notifyChanged()
}


export type ReminderRule={
  id:string
  client_id:string
  module_code:string|null
  reminder_type:string
  name:string|null
  local_time:string
  weekdays:number[]|null
  timezone:string
  enabled:boolean
  channels:string[]
  recipient_mode:'client'|'coach'|'both'
  skip_if_completed:boolean
  title_template:string|null
  body_template:string|null
  action_path:string|null
  settings:Record<string,unknown>
  created_by:string|null
}

export async function loadClientReminderRules(clientId:string):Promise<ReminderRule[]>{
  if(!supabase)throw new Error('Supabase не подключён')
  const {data,error}=await supabase.from('reminder_rules')
    .select('id,client_id,module_code,reminder_type,name,local_time,weekdays,timezone,enabled,channels,recipient_mode,skip_if_completed,title_template,body_template,action_path,settings,created_by')
    .eq('client_id',clientId)
    .order('created_at')
  if(error)throw error
  return (data??[]) as ReminderRule[]
}

export function reminderPreset(clientId:string,type:string,timezone='Europe/Moscow'):Omit<ReminderRule,'id'|'created_by'>{
  return makeReminderPreset(clientId,type,timezone)
}

export async function createClientReminderRule(clientId:string,type:string,timezone='Europe/Moscow'):Promise<ReminderRule>{
  const preset=reminderPreset(clientId,type,timezone)
  return createClientReminderRuleFromDraft({...preset,id:'draft:'+type,created_by:null})
}

export async function createClientReminderRuleFromDraft(rule:ReminderRule):Promise<ReminderRule>{
  if(!supabase)throw new Error('Supabase не подключён')
  const weekdayIssue=reminderWeekdaysIssue(rule.enabled,rule.weekdays)
  if(weekdayIssue)throw new Error(weekdayIssue)
  const authUser=await getVerifiedUser()
  const channels=rule.channels?.length?rule.channels:['in_app','telegram']
  const select='id,client_id,module_code,reminder_type,name,local_time,weekdays,timezone,enabled,channels,recipient_mode,skip_if_completed,title_template,body_template,action_path,settings,created_by'
  const {data,error}=await supabase.from('reminder_rules').insert({
    client_id:rule.client_id,module_code:rule.module_code,reminder_type:rule.reminder_type,name:rule.name,
    local_time:rule.local_time,weekdays:rule.weekdays,timezone:rule.timezone,enabled:rule.enabled,
    channels,recipient_mode:rule.recipient_mode,skip_if_completed:rule.skip_if_completed,
    title_template:rule.title_template,body_template:rule.body_template,action_path:rule.action_path,
    settings:rule.settings,created_by:authUser.id,channel:channels[0]??'in_app',
  }).select(select).single()
  if(!error)return data as ReminderRule

  const {data:existing,error:readError}=await supabase.from('reminder_rules')
    .select(select)
    .eq('client_id',rule.client_id)
    .eq('reminder_type',rule.reminder_type)
    .maybeSingle()
  if(!readError&&existing)return existing as ReminderRule
  throw error
}

export async function saveClientReminderRule(rule:ReminderRule):Promise<void>{
  if(!supabase)throw new Error('Supabase не подключён')
  const weekdayIssue=reminderWeekdaysIssue(rule.enabled,rule.weekdays)
  if(weekdayIssue)throw new Error(weekdayIssue)
  const {error}=await supabase.from('reminder_rules').update({
    module_code:rule.module_code,
    reminder_type:rule.reminder_type,
    name:rule.name,
    local_time:rule.local_time,
    weekdays:rule.weekdays,
    timezone:rule.timezone,
    enabled:rule.enabled,
    channels:rule.channels,
    recipient_mode:rule.recipient_mode,
    skip_if_completed:rule.skip_if_completed,
    title_template:rule.title_template,
    body_template:rule.body_template,
    action_path:rule.action_path,
    settings:rule.settings,
    channel:rule.channels[0]??'in_app',
    updated_at:new Date().toISOString(),
    last_processed_local_date:null,
  }).eq('id',rule.id).select('id').single()
  if(error)throw error
}
