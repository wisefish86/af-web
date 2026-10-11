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
type LoginRole='client'|'trainer'
type StatusResponse={
  status?:'pending'|'linked'|'unlinked'|'blocked'|'error'
  token_hash?:string
  profile_id?:string
  role?:LoginRole
  reason?:string
  error?:string
}

type PendingTelegramLogin={
  token:string
  createdAt:number
  role:LoginRole
}

function storageKey(role:LoginRole){return 'andrey-fit-telegram-web-login:'+role}

function callbackToken(){
  return new URLSearchParams(window.location.search).get('tg_login')?.trim()||''
}
function pendingLogin(role:LoginRole):PendingTelegramLogin|null{
  try{
    const raw=sessionStorage.getItem(storageKey(role))
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

export type TelegramLoginLinks={appUrl:string;webUrl:string}

function telegramAppUrl(webUrl:string){
  const url=new URL(webUrl)
  const username=url.pathname.replace(/^\/+|\/+$/g,'')
  const start=url.searchParams.get('start')||''
  if(!username)throw new Error('Некорректная Telegram-ссылка.')
  return 'tg://resolve?domain='+encodeURIComponent(username)+(start?'&start='+encodeURIComponent(start):'')
}

export async function prepareTelegramWebLogin(role:LoginRole='client'):Promise<TelegramLoginLinks>{
  const current=pendingLogin(role)
  if(current&&Date.now()-current.createdAt<8*60*1000){
    const username='andreyfit_bot'
    const webUrl='https://t.me/'+username+'?start='+encodeURIComponent('login_'+current.token)
    return {appUrl:telegramAppUrl(webUrl),webUrl}
  }

  const result=await invokeTelegramWebAuth({action:'begin',role})
  if(!result.enabled||!result.token||!result.bot_url){
    throw new Error(result.error||'Вход через Telegram сейчас недоступен.')
  }
  sessionStorage.setItem(storageKey(role),JSON.stringify({token:result.token,createdAt:Date.now(),role} satisfies PendingTelegramLogin))
  return {appUrl:telegramAppUrl(result.bot_url),webUrl:result.bot_url}
}

export function hasTelegramWebLoginCallback(){
  return Boolean(callbackToken())
}

export async function completeTelegramWebLogin(role:LoginRole='client'){
  if(!supabase)throw new Error('Supabase недоступен.')
  const callback=callbackToken()
  const pending=pendingLogin(role)
  const token=callback||pending?.token||''
  if(!token){
    clearCallbackUrl()
    throw new Error('Не найдена сессия входа через Telegram.')
  }
  if(pending&&Date.now()-pending.createdAt>12*60*1000){
    sessionStorage.removeItem(storageKey(role))
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
    sessionStorage.removeItem(storageKey(role))
    clearCallbackUrl()
    throw new Error('Этот Telegram ещё не привязан к профилю Andrey-Fit.')
  }
  if(result.status==='blocked'){
    sessionStorage.removeItem(storageKey(role))
    clearCallbackUrl()
    throw new Error(result.reason==='paused'
      ?'Сопровождение временно заморожено.'
      :result.reason==='finished'
        ?'Сопровождение завершено.'
        :'Доступ к сопровождению сейчас закрыт.')
  }
  if(result.status!=='linked'||!result.token_hash){
    sessionStorage.removeItem(storageKey(role))
    clearCallbackUrl()
    throw new Error(result.error||'Не удалось подтвердить вход через Telegram.')
  }
  if(result.role&&result.role!==role){
    sessionStorage.removeItem(storageKey(role))
    clearCallbackUrl()
    throw new Error('Telegram подтвердил другой режим входа. Начни вход заново.')
  }

  const {data,error}=await supabase.auth.verifyOtp({
    token_hash:result.token_hash,
    type:'email',
  })
  const userId=data.user?.id||data.session?.user.id||result.profile_id||''
  if(error||!userId)throw new Error('Не удалось создать сессию Andrey-Fit.')

  sessionStorage.removeItem(storageKey(role))
  clearCallbackUrl()
  return userId
}
