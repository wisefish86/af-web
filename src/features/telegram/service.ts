import { supabase } from '../../lib/supabase'
import { getTelegramInitData, getTelegramStartParam, type TelegramMiniAppUser } from '../../lib/telegram'

type TelegramAuthResponse={
  status?:'linked'|'unlinked'|'blocked'|'bound'
  token_hash?:string
  profile_id?:string
  reason?:string
  telegram_user?:TelegramMiniAppUser
  error?:string
  test_owner?:boolean
}

export type TelegramAuthResult=
  |{status:'linked';userId:string;testOwner:boolean}
  |{status:'unlinked';user:TelegramMiniAppUser|null}
  |{status:'blocked';reason:string}

async function withTimeout<T>(promise:Promise<T>,ms:number,message:string):Promise<T>{
  let timer:number|undefined
  try{
    return await Promise.race([
      promise,
      new Promise<T>((_,reject)=>{timer=window.setTimeout(()=>reject(new Error(message)),ms)}),
    ])
  }finally{
    if(timer!==undefined)window.clearTimeout(timer)
  }
}

export async function authenticateTelegramMiniApp():Promise<TelegramAuthResult>{
  if(!supabase)throw new Error('Supabase недоступен.')
  const initData=getTelegramInitData()
  if(!initData)throw new Error('Telegram не передал данные для входа.')

  const startParam=getTelegramStartParam()
  const {data,error}=await withTimeout(
    supabase.functions.invoke('telegram-auth',{
      body:{init_data:initData,action:'sign_in',start_param:startParam},
    }),
    12000,
    'Сервер входа не ответил. Проверь соединение с интернетом и, если сеть ограничивает доступ к серверу, попробуй другую сеть или VPN.',
  )
  if(error)throw new Error('Не удалось подтвердить вход через Telegram.')

  const response=(data??{}) as TelegramAuthResponse
  if(response.status==='unlinked'){
    return {status:'unlinked',user:response.telegram_user??null}
  }
  if(response.status==='blocked'){
    return {status:'blocked',reason:response.reason??'inactive'}
  }
  if(response.status!=='linked'||!response.token_hash){
    throw new Error(response.error||'Telegram-вход вернул некорректный ответ.')
  }

  const {data:auth,error:verifyError}=await withTimeout(
    supabase.auth.verifyOtp({
      token_hash:response.token_hash,
      type:'email',
    }),
    12000,
    'Сервер не успел создать сессию. Проверь соединение и повтори вход.',
  )
  const userId=auth.user?.id||auth.session?.user.id||response.profile_id||''
  if(verifyError||!userId)throw new Error('Не удалось создать сессию Andrey-Fit.')
  return {status:'linked',userId,testOwner:Boolean(response.test_owner)}
}

export async function bindOwnerTelegram(email:string,password:string){
  if(!supabase)throw new Error('Supabase недоступен.')
  const db=supabase
  const initData=getTelegramInitData()
  if(!initData)throw new Error('Telegram не передал данные для привязки.')

  const normalized=email.trim().toLowerCase()
  if(!normalized||!password)throw new Error('Укажи email и пароль тренера.')

  const {data:login,error:loginError}=await db.auth.signInWithPassword({
    email:normalized,
    password,
  })
  if(loginError||!login.session)throw new Error('Не удалось подтвердить тренерский аккаунт. Проверь email и пароль.')

  const invokeBind=()=>db.functions.invoke('telegram-auth',{
    body:{init_data:initData,action:'bind_owner'},
    headers:{Authorization:'Bearer '+login.session.access_token},
  })
  let result=await invokeBind()
  let response=(result.data??{}) as TelegramAuthResponse
  if(result.error||response.status!=='bound'){
    // bind_owner is idempotent: retry once before treating a lost HTTP response as failure.
    result=await invokeBind()
    response=(result.data??{}) as TelegramAuthResponse
  }
  if(result.error||response.status!=='bound'){
    await db.auth.signOut().catch(()=>undefined)
    throw new Error(response.error||'Не удалось привязать Telegram.')
  }
}
