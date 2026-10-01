import { supabase } from '../../lib/supabase'

export type TrainerContactChannel={
  id:string
  trainer_id:string
  channel:'telegram'|'whatsapp'|'max'
  url:string
  label:string|null
  enabled:boolean
  sort_order:number
}

export async function loadTrainerContactChannels():Promise<TrainerContactChannel[]>{
  if(!supabase)throw new Error('Supabase не подключён')
  const {data,error}=await supabase.from('trainer_contact_channels')
    .select('id,trainer_id,channel,url,label,enabled,sort_order')
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

export async function saveMyTrainerContactSettings(input:Record<'telegram'|'whatsapp'|'max',string>):Promise<void>{
  if(!supabase)throw new Error('Supabase не подключён')
  const {data:auth,error:authError}=await supabase.auth.getUser()
  if(authError||!auth.user)throw authError??new Error('Нужно войти')
  const uid=auth.user.id
  const defs=[
    {channel:'telegram' as const,label:'Telegram',sort_order:10},
    {channel:'whatsapp' as const,label:'WhatsApp',sort_order:20},
    {channel:'max' as const,label:'MAX',sort_order:30},
  ]
  for(const def of defs){
    const url=input[def.channel].trim()
    if(url&&!/^https:\/\//i.test(url))throw new Error(def.label+': ссылка должна начинаться с https://')
    if(!url){
      const {error}=await supabase.from('trainer_contact_channels').delete().eq('trainer_id',uid).eq('channel',def.channel)
      if(error)throw error
      continue
    }
    const {error}=await supabase.from('trainer_contact_channels').upsert({
      trainer_id:uid,channel:def.channel,url,label:def.label,enabled:true,sort_order:def.sort_order,updated_at:new Date().toISOString(),
    },{onConflict:'trainer_id,channel'})
    if(error)throw error
  }
}
