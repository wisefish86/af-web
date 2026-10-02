import { supabase } from '../../lib/supabase'
import type { ClientProfile } from './types'

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
