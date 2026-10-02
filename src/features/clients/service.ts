import { supabase } from '../../lib/supabase'

export type TrainerClient = {
  id:string
  display_name:string
  login_alias:string|null
  nickname:string|null
  age:number|null
  city:string|null
  avatar_key:string|null
  timezone:string
  status:string
  started_at:string
  ended_at:string|null
  last_activity_at:string|null
  last_activity_kind:string|null
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
  const {data,error}=await supabase.rpc('get_my_trainer_clients_overview')
  if(error)throw error
  return (data??[]) as TrainerClient[]
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
    .select('id,display_name,login_alias,nickname,age,city,avatar_key,timezone')
    .eq('id',clientId).single()
  if(profileError)throw profileError
  return {id:p.id,display_name:p.display_name,login_alias:p.login_alias,nickname:p.nickname,age:p.age,city:p.city,avatar_key:p.avatar_key,timezone:p.timezone??'Europe/Moscow',status:link.status,started_at:link.started_at,ended_at:null,last_activity_at:null,last_activity_kind:null}
}


export async function loadClientModules(clientId:string):Promise<Record<string,boolean>>{
  if(!supabase)throw new Error('Supabase не подключён')
  const {data,error}=await supabase.from('client_modules')
    .select('module_code,enabled').eq('client_id',clientId)
  if(error)throw error
  return Object.fromEntries((data??[]).map(x=>[x.module_code,x.enabled]))
}

export async function loadClientTracking(clientId:string):Promise<Record<string,{enabled:boolean;required:boolean}>>{
  if(!supabase)throw new Error('Supabase не подключён')
  const [{data:fields,error:fieldError},{data:config,error:configError}]=await Promise.all([
    supabase.from('tracking_fields').select('code,default_enabled,default_required'),
    supabase.from('client_tracking_config').select('field_code,enabled,required').eq('client_id',clientId),
  ])
  if(fieldError)throw fieldError
  if(configError)throw configError
  const configMap=new Map((config??[]).map(row=>[row.field_code,row]))
  return Object.fromEntries((fields??[]).map(field=>{
    const row=configMap.get(field.code)
    return [field.code,{
      enabled:row?.enabled??field.default_enabled,
      required:row?.required??field.default_required,
    }]
  }))
}

export async function saveClientWorkspace(
  clientId:string,
  modules:Record<string,boolean>,
  tracking:Record<string,{enabled:boolean;required:boolean}>,
  rules:unknown[],
){
  if(!supabase)throw new Error('Supabase не подключён')
  const {data,error}=await supabase.rpc('save_client_workspace',{
    p_client_id:clientId,
    p_modules:modules,
    p_tracking:tracking,
    p_rules:rules,
  })
  if(error)throw error
  return data as unknown[]
}


export type ClientAccessCredentials={
  client_id:string
  login:string
  password:string
}

async function invokeClientAccess(body:Record<string,unknown>):Promise<ClientAccessCredentials>{
  if(!supabase)throw new Error('Supabase не подключён')
  const {data,error}=await supabase.functions.invoke('trainer-client-access',{body})
  if(error)throw error
  if(!data||typeof data!=='object')throw new Error('Сервер не вернул данные доступа')
  if('error' in data&&data.error)throw new Error(String(data.error))
  return data as ClientAccessCredentials
}

export async function createManagedClient(input:{
  display_name:string
  nickname?:string
  age?:number|null
  login:string
}):Promise<ClientAccessCredentials>{
  return invokeClientAccess({
    action:'create',
    display_name:input.display_name,
    nickname:input.nickname??'',
    age:input.age??null,
    login:input.login,
  })
}

export async function resetManagedClientPassword(clientId:string):Promise<ClientAccessCredentials>{
  return invokeClientAccess({action:'reset_password',client_id:clientId})
}

export async function setManagedClientStatus(clientId:string,status:'active'|'paused'|'finished'):Promise<void>{
  if(!supabase)throw new Error('Supabase не подключён')
  const {data,error}=await supabase.functions.invoke('trainer-client-access',{body:{action:'set_status',client_id:clientId,status}})
  if(error)throw error
  if(data?.error)throw new Error(String(data.error))
}

export async function deleteManagedClient(clientId:string):Promise<void>{
  if(!supabase)throw new Error('Supabase не подключён')
  const {data,error}=await supabase.functions.invoke('trainer-client-access',{body:{action:'delete',client_id:clientId,confirm:'DELETE'}})
  if(error)throw error
  if(data?.error)throw new Error(String(data.error))
}
