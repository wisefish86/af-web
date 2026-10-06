import { supabase } from '../../lib/supabase'

export type TrainerContactChannel={
  id:string
  trainer_id:string
  channel:string
  url:string
  label:string|null
  enabled:boolean
  sort_order:number
}

export type TrainerContactSettings={
  telegram:string
  whatsapp:string
  max:string
  instagram:string
  phone:string
  website:string
}

export const emptyTrainerContactSettings:TrainerContactSettings={
  telegram:'',whatsapp:'',max:'',instagram:'',phone:'',website:'',
}

async function resolveTrainerIdForCurrentUser():Promise<string|null>{
  if(!supabase)throw new Error('Supabase не подключён')
  const {data:auth,error:authError}=await supabase.auth.getUser()
  if(authError||!auth.user)throw authError??new Error('Нужно войти')
  const uid=auth.user.id

  const {data:profile,error:profileError}=await supabase.from('profiles').select('role').eq('id',uid).maybeSingle()
  if(profileError)throw profileError
  if(profile?.role==='trainer')return uid

  const {data:link,error:linkError}=await supabase.from('coach_clients')
    .select('coach_id,started_at')
    .eq('client_id',uid)
    .eq('status','active')
    .order('started_at',{ascending:false})
    .limit(1)
    .maybeSingle()
  if(linkError)throw linkError
  return link?.coach_id??null
}

export async function loadTrainerContactChannels():Promise<TrainerContactChannel[]>{
  if(!supabase)throw new Error('Supabase не подключён')
  const trainerId=await resolveTrainerIdForCurrentUser()
  if(!trainerId)return []
  const {data,error}=await supabase.from('trainer_contact_channels')
    .select('id,trainer_id,channel,url,label,enabled,sort_order')
    .eq('trainer_id',trainerId)
    .eq('enabled',true)
    .order('sort_order')
  if(error)throw error
  return (data??[]) as TrainerContactChannel[]
}

export async function loadMyTrainerContactSettings():Promise<TrainerContactChannel[]>{
  if(!supabase)throw new Error('Supabase не подключён')
  const {data:auth,error:authError}=await supabase.auth.getUser()
  if(authError||!auth.user)throw authError??new Error('Нужно войти')
  const {data,error}=await supabase.from('trainer_contact_channels')
    .select('id,trainer_id,channel,url,label,enabled,sort_order')
    .eq('trainer_id',auth.user.id)
    .order('sort_order')
  if(error)throw error
  return (data??[]) as TrainerContactChannel[]
}

function normalizePhone(value:string){
  const trimmed=value.trim()
  if(!trimmed)return ''
  if(trimmed.startsWith('tel:+'))return trimmed
  const digits=trimmed.replace(/[^0-9+]/g,'')
  const withPlus=digits.startsWith('+')?digits:'+'+digits.replace(/^8(?=\d{10}$)/,'7')
  return 'tel:'+withPlus
}

export async function saveMyTrainerContactSettings(input:TrainerContactSettings):Promise<void>{
  if(!supabase)throw new Error('Supabase не подключён')
  const db=supabase
  const {data:auth,error:authError}=await db.auth.getUser()
  if(authError||!auth.user)throw authError??new Error('Нужно войти')
  const uid=auth.user.id
  const defs=[
    {channel:'telegram',label:'Telegram',sort_order:10,kind:'url'},
    {channel:'whatsapp',label:'WhatsApp',sort_order:20,kind:'url'},
    {channel:'max',label:'MAX',sort_order:30,kind:'url'},
    {channel:'phone',label:'Телефон',sort_order:40,kind:'phone'},
    {channel:'instagram',label:'Instagram',sort_order:50,kind:'url'},
    {channel:'website',label:'Сайт',sort_order:60,kind:'url'},
  ] as const

  const normalized=defs.map(def=>{
    let url=input[def.channel].trim()
    if(def.kind==='phone')url=normalizePhone(url)
    if(url&&def.kind==='url'&&!/^https:\/\//i.test(url))throw new Error(def.label+': ссылка должна начинаться с https://')
    if(url&&def.kind==='phone'&&!/^tel:\+\d{7,15}$/.test(url))throw new Error('Телефон: проверь номер в международном формате.')
    return {...def,url}
  })

  const payload=Object.fromEntries(normalized.map(def=>[def.channel,def.url]))
  const {error}=await db.rpc('save_my_trainer_contact_settings',{p_channels:payload})
  if(error)throw error
}

export function contactSettingsFromRows(rows:TrainerContactChannel[]):TrainerContactSettings{
  const next={...emptyTrainerContactSettings}
  for(const row of rows){
    if(row.channel==='phone'){
      next.phone=row.url.replace(/^tel:/,'')
      continue
    }
    if(row.channel in next)(next as Record<string,string>)[row.channel]=row.url
  }
  return next
}
