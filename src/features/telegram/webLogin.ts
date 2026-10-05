import { supabase } from '../../lib/supabase'

type AvailabilityResponse={
  enabled?:boolean
  bot_username?:string
  error?:string
}
type BeginResponse={
  enabled?:boolean
  token?:string
  bot_url?:string
  expires_in_seconds?:number
  error?:string
}
type StatusResponse={
  status?:'pending'|'linked'|'unlinked'|'blocked'|'error'
  token_hash?:string
  profile_id?:string
  reason?:string
  error?:string
}

type PendingTelegramLogin={
  token:string
  createdAt:number
}

const storageKey='andrey-fit-telegram-web-login'

function callbackToken(){
  return new URLSearchParams(window.location.search).get('tg_login')?.trim()||''
}
function pendingLogin():PendingTelegramLogin|null{
  try{
    const raw=sessionStorage.getItem(storageKey)
    if(!raw)return null
    const parsed=JSON.parse(raw) as PendingTelegramLogin
    if(!parsed?.token||!parsed?.createdAt)return null
    return parsed
  }catch{return null}
}
function clearCallbackUrl(){
  const url=new URL(window.location.href)
  url.searchParams.delete('tg_login')
  window.history.replaceState(window.history.state,document.title,url.pathname+url.search+url.hash)
}
function wait(ms:number){return new Promise<void>(resolve=>window.setTimeout(resolve,ms))}

async function invokeTelegramWebAuth(body:Record<string,unknown>){
  if(!supabase)throw new Error('Supabase недоступен.')
  const {data,error}=await supabase.functions.invoke('telegram-web-auth',{body})
  if(error)throw new Error('Сервис входа через Telegram недоступен.')
  return (data??{}) as AvailabilityResponse&BeginResponse&StatusResponse
}

export async function isTelegramWebLoginAvailable(){
  try{
    const data=await invokeTelegramWebAuth({action:'availability'})
    return Boolean(data.enabled)
  }catch{return false}
}

export async function beginTelegramWebLogin(){
  const result=await invokeTelegramWebAuth({action:'begin'})
  if(!result.enabled||!result.token||!result.bot_url){
    throw new Error(result.error||'Вход через Telegram сейчас недоступен.')
  }
  sessionStorage.setItem(storageKey,JSON.stringify({token:result.token,createdAt:Date.now()} satisfies PendingTelegramLogin))
  window.location.assign(result.bot_url)
}

export function hasTelegramWebLoginCallback(){
  return Boolean(callbackToken())
}

export async function completeTelegramWebLogin(){
  if(!supabase)throw new Error('Supabase недоступен.')
  const callback=callbackToken()
  const pending=pendingLogin()
  const token=callback||pending?.token||''
  if(!token){
    clearCallbackUrl()
    throw new Error('Не найдена сессия входа через Telegram.')
  }
  if(pending&&Date.now()-pending.createdAt>12*60*1000){
    sessionStorage.removeItem(storageKey)
    clearCallbackUrl()
    throw new Error('Сессия входа через Telegram устарела. Попробуй ещё раз.')
  }

  let result:StatusResponse={}
  for(let attempt=0;attempt<12;attempt++){
    result=await invokeTelegramWebAuth({action:'status',token})
    if(result.status!=='pending')break
    await wait(500)
  }

  if(result.status==='pending'){
    throw new Error('Telegram ещё не подтвердил вход. Вернись в бота и нажми «Открыть Andrey-Fit».')
  }
  if(result.status==='unlinked'){
    sessionStorage.removeItem(storageKey)
    clearCallbackUrl()
    throw new Error('Этот Telegram ещё не привязан к профилю Andrey-Fit.')
  }
  if(result.status==='blocked'){
    sessionStorage.removeItem(storageKey)
    clearCallbackUrl()
    throw new Error(result.reason==='paused'
      ?'Сопровождение временно заморожено.'
      :result.reason==='finished'
        ?'Сопровождение завершено.'
        :'Доступ к сопровождению сейчас закрыт.')
  }
  if(result.status!=='linked'||!result.token_hash){
    sessionStorage.removeItem(storageKey)
    clearCallbackUrl()
    throw new Error(result.error||'Не удалось подтвердить вход через Telegram.')
  }

  const {data,error}=await supabase.auth.verifyOtp({
    token_hash:result.token_hash,
    type:'email',
  })
  const userId=data.user?.id||data.session?.user.id||result.profile_id||''
  if(error||!userId)throw new Error('Не удалось создать сессию Andrey-Fit.')

  sessionStorage.removeItem(storageKey)
  clearCallbackUrl()
  return userId
}
