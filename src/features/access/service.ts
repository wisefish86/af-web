import { supabase } from '../../lib/supabase'

export type AccessHelpContact={channel:string;url:string;label:string|null}
export type AccessHelp={trainer_name:string|null;contacts:AccessHelpContact[]}

export async function completeClientFirstAccess(displayName:string,password:string):Promise<string>{
  if(!supabase)throw new Error('Supabase не подключён')
  if(displayName.trim().length<1)throw new Error('Укажи имя.')
  if(password.length<8)throw new Error('Пароль должен быть не короче 8 символов.')

  const {error:passwordError}=await supabase.auth.updateUser({password})
  if(passwordError)throw passwordError

  const requestedName=displayName.trim()
  const {data,error}=await supabase.rpc('complete_my_access_setup',{p_display_name:requestedName})
  if(error){
    // Password update happens before profile finalization. If the RPC response was lost,
    // reconcile against the profile instead of telling the client that setup failed.
    try{
      const {data:authData}=await supabase.auth.getUser()
      const userId=authData.user?.id
      if(userId){
        const {data:profile,error:profileError}=await supabase.from('profiles')
          .select('display_name,must_set_password')
          .eq('id',userId)
          .maybeSingle()
        if(!profileError&&profile&&profile.must_set_password===false){
          void supabase.auth.refreshSession()
          return profile.display_name||requestedName
        }
      }
    }catch{}
    throw new Error('Новый пароль уже сохранён, но завершение первого входа не подтвердилось. Нажми «Сохранить и войти» ещё раз — повтор безопасен.')
  }
  // Setup is already complete even if refreshing tokens temporarily fails.
  void supabase.auth.refreshSession()
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
