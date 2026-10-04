import { supabase } from '../../lib/supabase'

type InitResponse={
  enabled?:boolean
  client_id?:string
  nonce?:string
  error?:string
}
type CompleteResponse={
  status?:'linked'|'unlinked'|'blocked'
  token_hash?:string
  profile_id?:string
  reason?:string
  error?:string
}

type PendingTelegramLogin={
  state:string
  nonce:string
  verifier:string
  createdAt:number
}

const storageKey='andrey-fit-telegram-web-login'

function base64Url(bytes:Uint8Array){
  let binary=''
  for(const byte of bytes)binary+=String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')
}
function randomValue(length=32){
  return base64Url(crypto.getRandomValues(new Uint8Array(length)))
}
async function sha256Base64Url(value:string){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))
  return base64Url(new Uint8Array(digest))
}
function redirectUri(){
  return window.location.origin+'/'
}
async function invokeTelegramWebAuth(body:Record<string,unknown>){
  if(!supabase)throw new Error('Supabase недоступен.')
  const {data,error}=await supabase.functions.invoke('telegram-web-auth',{body})
  if(error)throw new Error('Сервис входа через Telegram недоступен.')
  return (data??{}) as InitResponse&CompleteResponse
}

export async function isTelegramWebLoginAvailable(){
  try{
    const data=await invokeTelegramWebAuth({action:'init'})
    return Boolean(data.enabled&&data.client_id&&data.nonce)
  }catch{return false}
}

export async function beginTelegramWebLogin(){
  const init=await invokeTelegramWebAuth({action:'init'})
  if(!init.enabled||!init.client_id||!init.nonce){
    throw new Error('Вход через Telegram пока не настроен.')
  }

  const verifier=randomValue(48)
  const state=randomValue(24)
  const challenge=await sha256Base64Url(verifier)
  const pending:PendingTelegramLogin={
    state,
    nonce:init.nonce,
    verifier,
    createdAt:Date.now(),
  }
  sessionStorage.setItem(storageKey,JSON.stringify(pending))

  const url=new URL('https://oauth.telegram.org/auth')
  url.searchParams.set('client_id',init.client_id)
  url.searchParams.set('redirect_uri',redirectUri())
  url.searchParams.set('response_type','code')
  url.searchParams.set('scope','openid profile')
  url.searchParams.set('state',state)
  url.searchParams.set('nonce',init.nonce)
  url.searchParams.set('code_challenge',challenge)
  url.searchParams.set('code_challenge_method','S256')
  window.location.assign(url.toString())
}

export function hasTelegramWebLoginCallback(){
  const params=new URLSearchParams(window.location.search)
  return params.has('code')||params.has('error')
}

function clearCallbackUrl(){
  const url=new URL(window.location.href)
  ;['code','state','error','error_description'].forEach(key=>url.searchParams.delete(key))
  window.history.replaceState(window.history.state,document.title,url.pathname+url.search+url.hash)
}

export async function completeTelegramWebLogin(){
  if(!supabase)throw new Error('Supabase недоступен.')
  const params=new URLSearchParams(window.location.search)
  const oauthError=params.get('error')
  if(oauthError){
    const description=params.get('error_description')||'Вход через Telegram отменён.'
    sessionStorage.removeItem(storageKey)
    clearCallbackUrl()
    throw new Error(description)
  }

  const code=params.get('code')||''
  const state=params.get('state')||''
  if(!code||!state)throw new Error('Telegram не вернул данные авторизации.')

  let pending:PendingTelegramLogin|null=null
  try{
    const raw=sessionStorage.getItem(storageKey)
    pending=raw?JSON.parse(raw) as PendingTelegramLogin:null
  }catch{}
  if(!pending||pending.state!==state||Date.now()-pending.createdAt>10*60*1000){
    sessionStorage.removeItem(storageKey)
    clearCallbackUrl()
    throw new Error('Сессия входа через Telegram устарела. Попробуй ещё раз.')
  }

  const result=await invokeTelegramWebAuth({
    action:'exchange',
    code,
    code_verifier:pending.verifier,
    nonce:pending.nonce,
    redirect_uri:redirectUri(),
  })
  sessionStorage.removeItem(storageKey)
  clearCallbackUrl()

  if(result.status==='unlinked')throw new Error('Этот Telegram ещё не привязан к клиенту Andrey-Fit.')
  if(result.status==='blocked')throw new Error('Доступ к сопровождению сейчас закрыт.')
  if(result.status!=='linked'||!result.token_hash){
    throw new Error(result.error||'Не удалось войти через Telegram.')
  }

  const {data,error}=await supabase.auth.verifyOtp({
    token_hash:result.token_hash,
    type:'email',
  })
  const userId=data.user?.id||data.session?.user.id||result.profile_id||''
  if(error||!userId)throw new Error('Не удалось создать сессию Andrey-Fit.')
  return userId
}
