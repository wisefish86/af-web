import { supabase } from '../../lib/supabase'
import type { ClientProfile } from './types'
import { getAppBaseUrl } from '../../lib/appUrl'

export async function loadMyProfile():Promise<ClientProfile>{
  if(!supabase) throw new Error('Supabase не подключён')
  const {data:auth,error:authError}=await supabase.auth.getUser()
  if(authError||!auth.user) throw authError??new Error('Нужно войти')
  const {data,error}=await supabase.from('profiles')
    .select('id,display_name,login_alias,nickname,age,city,timezone,avatar_key')
    .eq('id',auth.user.id).single()
  if(error) throw error
  return {
    id:data.id,display_name:data.display_name,login_alias:data.login_alias,
    nickname:data.nickname,age:data.age,city:data.city,timezone:data.timezone,
    avatar_key:data.avatar_key,
  }
}

export async function saveMyProfile(profile:Pick<ClientProfile,'display_name'|'nickname'|'age'|'city'|'timezone'|'avatar_key'>){
  if(!supabase) throw new Error('Supabase не подключён')
  const {error}=await supabase.rpc('update_my_profile',{
    p_display_name:profile.display_name.trim(),
    p_nickname:profile.nickname?.trim()||null,
    p_age:profile.age,
    p_city:profile.city?.trim()||null,
    p_timezone:profile.timezone,
    p_avatar_key:profile.avatar_key,
  })
  if(error) throw error
}

export type TrainerSecurityInfo={
  email:string
  emailConfirmed:boolean
  lastSignInAt:string|null
}

export async function loadTrainerSecurityInfo():Promise<TrainerSecurityInfo>{
  if(!supabase)throw new Error('Supabase не подключён')
  const {data,error}=await supabase.auth.getUser()
  if(error||!data.user)throw error??new Error('Нужно войти')
  if(!data.user.email)throw new Error('У аккаунта тренера не задан email.')
  return {
    email:data.user.email,
    emailConfirmed:Boolean(data.user.email_confirmed_at),
    lastSignInAt:data.user.last_sign_in_at??null,
  }
}

export async function sendMyTrainerPasswordRecovery():Promise<void>{
  if(!supabase)throw new Error('Supabase не подключён')
  const {data,error}=await supabase.auth.getUser()
  if(error||!data.user)throw error??new Error('Нужно войти')
  if(!data.user.email)throw new Error('У аккаунта тренера не задан email.')
  const {error:resetError}=await supabase.auth.resetPasswordForEmail(data.user.email,{
    redirectTo:getAppBaseUrl()+'?reset=1',
  })
  if(resetError)throw resetError
}
