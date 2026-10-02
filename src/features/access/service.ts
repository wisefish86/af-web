import { supabase } from '../../lib/supabase'

export type AccessHelpContact={channel:string;url:string;label:string|null}
export type AccessHelp={trainer_name:string|null;contacts:AccessHelpContact[]}

export async function completeClientFirstAccess(displayName:string,password:string):Promise<string>{
  if(!supabase)throw new Error('Supabase не подключён')
  if(displayName.trim().length<1)throw new Error('Укажи имя.')
  if(password.length<8)throw new Error('Пароль должен быть не короче 8 символов.')

  const {error:passwordError}=await supabase.auth.updateUser({password})
  if(passwordError)throw passwordError

  const {data,error}=await supabase.rpc('complete_my_access_setup',{p_display_name:displayName.trim()})
  if(error)throw error
  return data as string
}

export async function loadAccessHelp(login:string):Promise<AccessHelp>{
  if(!supabase)throw new Error('Supabase не подключён')
  const {data,error}=await supabase.functions.invoke('client-access-help',{body:{login}})
  if(error)throw error
  return {
    trainer_name:typeof data?.trainer_name==='string'?data.trainer_name:null,
    contacts:Array.isArray(data?.contacts)?data.contacts:[],
  }
}
