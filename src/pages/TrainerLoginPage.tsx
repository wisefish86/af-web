import { useEffect, useRef, useState } from 'react'
import { Activity, ArrowRight, Send, ShieldCheck } from 'lucide-react'
import { hasSupabaseConfig, supabase } from '../lib/supabase'
import { getAppBaseUrl } from '../lib/appUrl'
import { AuthLoadingScreen } from '../components/AuthLoadingScreen'
import { completeTelegramWebLogin, hasTelegramWebLoginCallback, prepareTelegramWebLogin } from '../features/telegram/webLogin'

async function withTimeout<T>(promise:PromiseLike<T>,ms=12000):Promise<T>{
  let timer:number|undefined
  try{
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((_,reject)=>{timer=window.setTimeout(()=>reject(new Error('timeout')),ms)}),
    ])
  }finally{
    if(timer!==undefined)window.clearTimeout(timer)
  }
}

type TrainerFallbackSession={
  access_token:string
  refresh_token:string
  expires_at?:number
  expires_in?:number
}
const trainerLoginFallbackUrl='https://jjaunlbglskpddslwegp.functions.supabase.co/trainer-login-fallback'

function isInvalidCredentials(error:unknown){
  if(!error||typeof error!=='object')return false
  const value=error as {status?:number;message?:string}
  return value.status===400&&/invalid login credentials|invalid credentials/i.test(value.message??'')
}

async function fallbackTrainerLogin(email:string,password:string):Promise<TrainerFallbackSession>{
  const response=await withTimeout(fetch(trainerLoginFallbackUrl,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({email,password}),
    cache:'no-store',
  }),12000)
  const payload=await response.json().catch(()=>null) as (TrainerFallbackSession&{error?:string})|null
  if(!response.ok){
    const error=new Error(payload?.error||'Резервный сервер входа не ответил.')
    ;(error as Error&{status?:number}).status=response.status
    throw error
  }
  if(!payload?.access_token||!payload.refresh_token)throw new Error('Резервный сервер входа вернул неполную сессию.')
  return payload
}

export function TrainerLoginPage(){
  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  const [loading,setLoading]=useState(false)
  const [telegramAppUrl,setTelegramAppUrl]=useState('')
  const [telegramReady,setTelegramReady]=useState<boolean|null>(null)
  const [telegramLoading,setTelegramLoading]=useState(false)
  const telegramCallbackStarted=useRef(false)

  useEffect(()=>{
    let cancelled=false
    void prepareTelegramWebLogin('trainer')
      .then(links=>{if(!cancelled){setTelegramAppUrl(links.appUrl);setTelegramReady(true)}})
      .catch(()=>{if(!cancelled)setTelegramReady(false)})
    return()=>{cancelled=true}
  },[])

  useEffect(()=>{
    if(!hasTelegramWebLoginCallback()||telegramCallbackStarted.current)return
    telegramCallbackStarted.current=true
    setTelegramLoading(true);setError('');setMessage('')
    void completeTelegramWebLogin('trainer')
      .then(()=>{window.location.hash='#/'})
      .catch(e=>setError(e instanceof Error?e.message:'Не удалось войти через Telegram.'))
      .finally(()=>setTelegramLoading(false))
  },[])

  async function login(e:React.FormEvent){
    e.preventDefault()
    if(!supabase)return
    const db=supabase
    const normalizedEmail=email.trim().toLowerCase()
    setLoading(true);setError('');setMessage('')
    try{
      let userId:string|null=null

      try{
        const direct=await withTimeout(
          db.auth.signInWithPassword({email:normalizedEmail,password}),
          7000,
        )
        if(direct.error){
          if(isInvalidCredentials(direct.error)){
            setError('Не удалось войти. Проверь email и пароль.')
            return
          }
          throw direct.error
        }
        userId=direct.data.user?.id??null
      }catch(directError){
        if(isInvalidCredentials(directError)){
          setError('Не удалось войти. Проверь email и пароль.')
          return
        }

        try{
          const fallback=await fallbackTrainerLogin(normalizedEmail,password)
          const sessionResult=await withTimeout(db.auth.setSession({
            access_token:fallback.access_token,
            refresh_token:fallback.refresh_token,
          }),10000)
          if(sessionResult.error||!sessionResult.data.user)throw sessionResult.error??new Error('Не удалось установить сессию.')
          userId=sessionResult.data.user.id
        }catch(fallbackError){
          const fallbackStatus=fallbackError&&typeof fallbackError==='object'&&'status' in fallbackError
            ? Number((fallbackError as {status?:unknown}).status)
            : null
          if(fallbackStatus===401){
            setError('Не удалось войти. Проверь email и пароль.')
          }else if(fallbackStatus===403){
            setError('Этот аккаунт не имеет доступа к кабинету тренера.')
          }else{
            setError('Не удалось войти ни через основной, ни через резервный канал. Отключи VPN на минуту и попробуй ещё раз.')
          }
          return
        }
      }

      if(!userId){
        setError('Не удалось получить данные аккаунта тренера.')
        return
      }

      const loadRole=()=>withTimeout(
        db.from('profiles').select('role').eq('id',userId).maybeSingle(),
        10000,
      )

      let profileResult
      try{
        profileResult=await loadRole()
      }catch{
        await new Promise(resolve=>window.setTimeout(resolve,300))
        try{profileResult=await loadRole()}
        catch{
          setError('Вход выполнен, но профиль тренера не загрузился. Повтори попытку — сессия уже сохранена.')
          return
        }
      }

      const {data:profile,error:profileError}=profileResult
      if(profileError){
        setError('Вход выполнен, но не удалось проверить профиль тренера. Попробуй ещё раз.')
        return
      }
      if(profile?.role!=='trainer'){
        await db.auth.signOut().catch(()=>undefined)
        setError('Этот аккаунт не имеет доступа к кабинету тренера.')
        return
      }

      window.location.hash='#/'
    }finally{
      setLoading(false)
    }
  }

  async function resetPassword(){
    if(!supabase)return
    const normalized=email.trim().toLowerCase()
    if(!normalized||!normalized.includes('@')){
      setError('Сначала укажи email тренера.')
      return
    }
    setLoading(true);setError('');setMessage('')
    try{
      const {error:resetError}=await supabase.auth.resetPasswordForEmail(normalized,{
        redirectTo:getAppBaseUrl()+'?reset=1#/trainer-access',
      })
      if(resetError)throw resetError
      setMessage('Ссылка для смены пароля отправлена на почту.')
    }catch{
      setError('Не удалось отправить ссылку для смены пароля.')
    }finally{
      setLoading(false)
    }
  }

  if(telegramLoading&&hasTelegramWebLoginCallback())return <AuthLoadingScreen title="Входим как тренер через Telegram…" subtitle="Подтверждаем тренерский профиль и открываем кабинет."/>

  return <div className="login-page">
    <div className="login-visual">
      <div className="login-brand"><div className="brand-mark large"><Activity size={26}/></div><span>Andrey-Fit</span></div>
      <div className="login-copy"><span className="kicker">Кабинет тренера</span><h1>Рабочее пространство Andrey-Fit.</h1><p>Клиенты, программы, питание, прогресс и сообщения — в одном кабинете.</p></div>
      <div className="secure-note"><ShieldCheck size={20}/><span>Доступ разрешён только аккаунту с ролью тренера.</span></div>
    </div>
    <div className="login-panel">
      <div className="login-form-wrap">
        <h2>Вход тренера</h2>
        <p className="muted">Используй email и пароль тренерского аккаунта.</p>
        {hasSupabaseConfig&&<form onSubmit={login} className="login-form">
          <label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value.replace(/\s/g,''))} placeholder="trainer@example.com" required autoCapitalize="none" autoCorrect="off" autoComplete="username"/></label>
          <label>Пароль<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required autoComplete="current-password"/></label>
          <button type="button" className="forgot-password-button" disabled={loading} onClick={()=>void resetPassword()}>Не помню пароль</button>
          {message&&<div className="form-success">{message}</div>}
          <button className="primary-button" disabled={loading}>{loading?'Входим…':'Войти в кабинет'}<ArrowRight size={18}/></button>
        </form>}
        <p className="muted">или</p>
        {telegramReady===null
          ?<div className="form-success">Готовим вход через Telegram…</div>
          :telegramReady&&telegramAppUrl
            ?<div className="telegram-login-block">
              <a className="primary-button secondary" href={telegramAppUrl} onClick={()=>{setError('');setTelegramLoading(true)}}><Send size={18}/>{telegramLoading?'Открываем Telegram…':'Войти как тренер через Telegram'}</a>
              <div className="telegram-login-hint">Тот же бот, но вход будет выполнен именно в тренерский профиль.</div>
            </div>
            :<div className="form-error">Вход тренера через Telegram сейчас недоступен. Используй email и пароль.</div>}
        {error&&<div className="form-error">{error}</div>}
        <a className="trainer-access-link" href="/#/">Вернуться к входу клиента</a>
      </div>
    </div>
  </div>
}
