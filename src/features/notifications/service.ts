import { supabase } from '../../lib/supabase'

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
export type NotificationTopicPreference={user_id:string;channel:'telegram'|'web_push';topic_code:NotificationTopicCode;enabled:boolean}
export type TelegramChannelState={connected:boolean;verified:boolean;enabled:boolean}

export async function loadTelegramChannelState():Promise<TelegramChannelState>{
  if(!supabase)throw new Error('Supabase не подключён')
  const {data:auth,error:authError}=await supabase.auth.getUser()
  if(authError||!auth.user)throw authError??new Error('Нужно войти')
  const {data,error}=await supabase.from('notification_channels')
    .select('enabled,verified_at,external_id')
    .eq('client_id',auth.user.id).eq('channel','telegram')
    .maybeSingle()
  if(error)throw error
  return {
    connected:Boolean(data?.external_id),
    verified:Boolean(data?.verified_at),
    enabled:Boolean(data?.enabled),
  }
}

export async function loadTelegramTopicPreferences():Promise<Record<NotificationTopicCode,boolean>>{
  if(!supabase)throw new Error('Supabase не подключён')
  const defaults:Record<NotificationTopicCode,boolean>={feedback:true,workouts:true,progress:true,nutrition:true,checkins:true,general:true}
  const {data:auth,error:authError}=await supabase.auth.getUser()
  if(authError||!auth.user)throw authError??new Error('Нужно войти')
  const {data,error}=await supabase.from('notification_channel_topic_preferences')
    .select('topic_code,enabled')
    .eq('user_id',auth.user.id).eq('channel','telegram')
  if(error)throw error
  for(const row of data??[]){
    if(row.topic_code in defaults)defaults[row.topic_code as NotificationTopicCode]=Boolean(row.enabled)
  }
  return defaults
}

export async function saveTelegramTopicPreference(topic:NotificationTopicCode,enabled:boolean):Promise<void>{
  if(!supabase)throw new Error('Supabase не подключён')
  const {data:auth,error:authError}=await supabase.auth.getUser()
  if(authError||!auth.user)throw authError??new Error('Нужно войти')
  const {error}=await supabase.from('notification_channel_topic_preferences').upsert({
    user_id:auth.user.id,channel:'telegram',topic_code:topic,enabled,updated_at:new Date().toISOString(),
  },{onConflict:'user_id,channel,topic_code'})
  if(error)throw error
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
  const {data:auth,error:authError}=await supabase.auth.getUser()
  if(authError||!auth.user)throw authError??new Error('Нужно войти')
  const {data,error}=await supabase.from('notification_channel_topic_preferences')
    .select('topic_code,enabled')
    .eq('user_id',auth.user.id)
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
  const {data:auth,error:authError}=await supabase.auth.getUser()
  if(authError||!auth.user)throw authError??new Error('Нужно войти')
  const {error}=await supabase.from('notification_channel_topic_preferences').upsert({
    user_id:auth.user.id,channel,topic_code:topic,enabled,updated_at:new Date().toISOString(),
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

export async function loadNotifications(limit=50):Promise<NotificationItem[]>{
  if(!supabase)throw new Error('Supabase не подключён')
  const {data:auth,error:authError}=await supabase.auth.getUser()
  if(authError||!auth.user)throw authError??new Error('Нужно войти')
  const {data,error}=await supabase.from('notification_deliveries')
    .select('id,client_id,recipient_id,channel,title,body,action_path,status,scheduled_for,delivered_at,read_at,dismissed_at,created_at,payload')
    .eq('recipient_id',auth.user.id)
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
  const {data:auth}=await supabase.auth.getUser()
  if(!auth.user)return 0
  const {count,error}=await supabase.from('notification_deliveries')
    .select('id',{count:'exact',head:true})
    .eq('recipient_id',auth.user.id)
    .eq('channel','in_app')
    .eq('status','sent')
    .not('delivered_at','is',null)
    .is('read_at',null)
    .is('dismissed_at',null)
  if(error)return 0
  return count??0
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
  const common={
    client_id:clientId,timezone,enabled:true,channels:['in_app','telegram'],
    recipient_mode:'client' as const,skip_if_completed:true,settings:{} as Record<string,unknown>,
  }
  if(type==='weight')return {...common,module_code:'progress',reminder_type:'weight',name:'Взвешивание',local_time:'08:00:00',weekdays:[1,3,6],title_template:'Пора взвеситься',body_template:'Запиши утренний вес. Если уже записал — напоминание будет пропущено.',action_path:'/progress'}
  if(type==='waist')return {...common,module_code:'progress',reminder_type:'waist',name:'Замер талии',local_time:'08:10:00',weekdays:[6],title_template:'Замер талии',body_template:'Сегодня день контрольного замера талии.',action_path:'/progress'}
  if(type==='nutrition')return {...common,module_code:'nutrition',reminder_type:'nutrition',name:'Питание за день',local_time:'21:00:00',weekdays:[1,2,3,4,5,6,7],title_template:'Как прошло питание?',body_template:'Отметь соблюдение Meal Plan и, если нужно, перебор или недобор калорий.',action_path:'/nutrition'}
  if(type==='daily_checkin')return {...common,module_code:'checkins',reminder_type:'daily_checkin',name:'Самочувствие',local_time:'21:10:00',weekdays:[1,2,3,4,5,6,7],title_template:'Как самочувствие?',body_template:'Коротко отметь энергию, сон, стресс, голод и лёгкость соблюдения питания.',action_path:'/'}
  if(type==='monthly_measurements')return {...common,settings:{period:'monthly'},module_code:'progress',reminder_type:'monthly_measurements',name:'Дополнительные замеры',local_time:'09:00:00',weekdays:[6],title_template:'Ежемесячные замеры',body_template:'Если в этом месяце ещё не снимал объёмы — самое время.',action_path:'/progress'}
  if(type==='progress_photo')return {...common,settings:{period:'monthly'},module_code:'progress',reminder_type:'progress_photo',name:'Фото прогресса',local_time:'09:15:00',weekdays:[6],title_template:'Фото прогресса',body_template:'Сделай фото для себя в одинаковом свете и ракурсе. Загружать его в приложение не нужно.',action_path:'/progress'}
  if(type==='monthly_checkin')return {...common,settings:{period:'monthly'},module_code:'progress',reminder_type:'monthly_checkin',name:'Ежемесячный обзор',local_time:'20:30:00',weekdays:[7],title_template:'Итоги месяца',body_template:'Коротко оцени самочувствие, форму, сон и питание за месяц.',action_path:'/progress'}
  return {...common,module_code:'training',reminder_type:'workout',name:'Тренировка',local_time:'18:00:00',weekdays:[1,3,5],title_template:'Сегодня тренировка',body_template:'Открой тренировку, когда будешь готов начать.',action_path:'/workouts'}
}

export async function createClientReminderRule(clientId:string,type:string,timezone='Europe/Moscow'):Promise<ReminderRule>{
  const preset=reminderPreset(clientId,type,timezone)
  return createClientReminderRuleFromDraft({...preset,id:'draft:'+type,created_by:null})
}

export async function createClientReminderRuleFromDraft(rule:ReminderRule):Promise<ReminderRule>{
  if(!supabase)throw new Error('Supabase не подключён')
  if(rule.enabled&&(!rule.weekdays||rule.weekdays.length===0))throw new Error('Для включённого напоминания выбери хотя бы один день.')
  const {data:auth,error:authError}=await supabase.auth.getUser()
  if(authError||!auth.user)throw authError??new Error('Нужно войти')
  const {data,error}=await supabase.from('reminder_rules').insert({
    client_id:rule.client_id,module_code:rule.module_code,reminder_type:rule.reminder_type,name:rule.name,
    local_time:rule.local_time,weekdays:rule.weekdays,timezone:rule.timezone,enabled:rule.enabled,
    channels:['in_app','telegram'],recipient_mode:rule.recipient_mode,skip_if_completed:rule.skip_if_completed,
    title_template:rule.title_template,body_template:rule.body_template,action_path:rule.action_path,
    settings:rule.settings,created_by:auth.user.id,channel:'in_app',
  }).select('id,client_id,module_code,reminder_type,name,local_time,weekdays,timezone,enabled,channels,recipient_mode,skip_if_completed,title_template,body_template,action_path,settings,created_by').single()
  if(error)throw error
  return data as ReminderRule
}

export async function saveClientReminderRule(rule:ReminderRule):Promise<void>{
  if(!supabase)throw new Error('Supabase не подключён')
  if(rule.enabled&&(!rule.weekdays||rule.weekdays.length===0))throw new Error('Для включённого напоминания выбери хотя бы один день.')
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
