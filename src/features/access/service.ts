import { supabase } from '../../lib/supabase'

export type AccessHelpContact={channel:string;url:string;label:string|null}
export type AccessHelp={trainer_name:string|null;contacts:AccessHelpContact[]}

export async function completeClientFirstAccess(input:{
  displayName:string
  nickname:string
  age:number|null
  password?:string
}):Promise<string>{
  if(!supabase)throw new Error('Supabase не подключён')
  const displayName=input.displayName.trim()
  if(displayName.length<1)throw new Error('Укажи имя.')
  if(input.age!=null&&(!Number.isInteger(input.age)||input.age<13||input.age>100))throw new Error('Возраст должен быть от 13 до 100 лет.')

  if(input.password!==undefined){
    if(input.password.length<8)throw new Error('Пароль должен быть не короче 8 символов.')
    const {error:passwordError}=await supabase.auth.updateUser({password:input.password})
    if(passwordError)throw passwordError
  }

  const {data,error}=await supabase.rpc('complete_my_access_setup_v2',{
    p_display_name:displayName,
    p_nickname:input.nickname.trim()||null,
    p_age:input.age,
  })
  if(error){
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
          return profile.display_name||displayName
        }
      }
    }catch{}
    throw new Error(input.password!==undefined
      ?'Новый пароль уже мог сохраниться, но завершение настройки не подтвердилось. Нажми «Сохранить» ещё раз — повтор безопасен.'
      :'Не удалось завершить настройку профиля. Попробуй ещё раз.')
  }
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
