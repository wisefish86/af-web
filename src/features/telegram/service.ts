import { supabase } from '../../lib/supabase'
import { getTelegramInitData, type TelegramMiniAppUser } from '../../lib/telegram'

type TelegramAuthResponse={
  status?:'linked'|'unlinked'|'blocked'
  token_hash?:string
  profile_id?:string
  reason?:string
  telegram_user?:TelegramMiniAppUser
  error?:string
}

export type TelegramAuthResult=
  |{status:'linked';userId:string}
  |{status:'unlinked';user:TelegramMiniAppUser|null}
  |{status:'blocked';reason:string}

export async function authenticateTelegramMiniApp():Promise<TelegramAuthResult>{
  if(!supabase)throw new Error('Supabase недоступен.')
  const initData=getTelegramInitData()
  if(!initData)throw new Error('Telegram не передал данные для входа.')

  const {data,error}=await supabase.functions.invoke('telegram-auth',{
    body:{init_data:initData},
  })
  if(error)throw new Error('Не удалось подтвердить вход через Telegram.')

  const response=(data??{}) as TelegramAuthResponse
  if(response.status==='unlinked'){
    return {status:'unlinked',user:response.telegram_user??null}
  }
  if(response.status==='blocked'){
    return {status:'blocked',reason:response.reason??'blocked'}
  }
  if(response.status!=='linked'||!response.token_hash){
    throw new Error(response.error||'Telegram-вход вернул некорректный ответ.')
  }

  const {data:auth,error:verifyError}=await supabase.auth.verifyOtp({
    token_hash:response.token_hash,
    type:'email',
  })
  const userId=auth.user?.id||auth.session?.user.id||response.profile_id||''
  if(verifyError||!userId)throw new Error('Не удалось создать сессию Andrey-Fit.')
  return {status:'linked',userId}
}
