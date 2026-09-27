import { supabase } from '../../lib/supabase'

export type TrainerClient = {
  id:string
  display_name:string
  nickname:string|null
  age:number|null
  city:string|null
  avatar_key:string|null
  status:string
  started_at:string
}

export type ClientInviteRow = {
  id:string
  expires_at:string
  accepted_at:string|null
  revoked_at:string|null
  created_at:string
}

export async function loadTrainerClients():Promise<TrainerClient[]>{
  if(!supabase)throw new Error('Supabase не подключён')
  const {data:auth,error:authError}=await supabase.auth.getUser()
  if(authError||!auth.user)throw authError??new Error('Нужно войти')
  const {data:links,error:linkError}=await supabase
    .from('coach_clients')
    .select('client_id,status,started_at')
    .eq('coach_id',auth.user.id)
    .neq('status','ended')
    .order('created_at',{ascending:false})
  if(linkError)throw linkError
  const ids=(links??[]).map(x=>x.client_id)
  if(!ids.length)return []
  const {data:profiles,error:profileError}=await supabase
    .from('profiles')
    .select('id,display_name,nickname,age,city,avatar_key')
    .in('id',ids)
  if(profileError)throw profileError
  const byId=new Map((profiles??[]).map(p=>[p.id,p]))
  return (links??[]).flatMap(link=>{
    const p=byId.get(link.client_id)
    if(!p)return []
    return [{
      id:p.id,display_name:p.display_name,nickname:p.nickname,age:p.age,city:p.city,
      avatar_key:p.avatar_key,status:link.status,started_at:link.started_at,
    }]
  })
}

export async function createClientInvite(hours=168):Promise<string>{
  if(!supabase)throw new Error('Supabase не подключён')
  const {data,error}=await supabase.rpc('create_client_invite',{p_hours:hours})
  if(error)throw error
  return data as string
}

export async function loadClientInvites():Promise<ClientInviteRow[]>{
  if(!supabase)throw new Error('Supabase не подключён')
  const {data,error}=await supabase.from('client_invites')
    .select('id,expires_at,accepted_at,revoked_at,created_at')
    .order('created_at',{ascending:false}).limit(10)
  if(error)throw error
  return data??[]
}

export async function revokeClientInvite(id:string){
  if(!supabase)throw new Error('Supabase не подключён')
  const {error}=await supabase.rpc('revoke_client_invite',{p_invite_id:id})
  if(error)throw error
}


export async function loadTrainerClient(clientId:string):Promise<TrainerClient>{
  if(!supabase)throw new Error('Supabase не подключён')
  const {data:auth,error:authError}=await supabase.auth.getUser()
  if(authError||!auth.user)throw authError??new Error('Нужно войти')
  const {data:link,error:linkError}=await supabase.from('coach_clients')
    .select('client_id,status,started_at')
    .eq('coach_id',auth.user.id).eq('client_id',clientId).neq('status','ended').single()
  if(linkError)throw linkError
  const {data:p,error:profileError}=await supabase.from('profiles')
    .select('id,display_name,nickname,age,city,avatar_key')
    .eq('id',clientId).single()
  if(profileError)throw profileError
  return {id:p.id,display_name:p.display_name,nickname:p.nickname,age:p.age,city:p.city,avatar_key:p.avatar_key,status:link.status,started_at:link.started_at}
}
