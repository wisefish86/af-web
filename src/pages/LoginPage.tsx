import { useEffect, useRef, useState } from 'react'
import { Activity, ArrowRight, Send, ShieldCheck } from 'lucide-react'
import { completeTelegramWebLogin, hasTelegramWebLoginCallback, prepareTelegramWebLogin } from '../features/telegram/webLogin'
import { supabase } from '../lib/supabase'
import { getAppBaseUrl } from '../lib/appUrl'

type Props={onAuthenticated:()=>void}

export function LoginPage({onAuthenticated}:Props){
  const [telegramAppUrl,setTelegramAppUrl]=useState('')
  const [telegramWebUrl,setTelegramWebUrl]=useState('')
  const [telegramReady,setTelegramReady]=useState<boolean|null>(null)
  const [telegramLoading,setTelegramLoading]=useState(false)
  const [login,setLogin]=useState('')
  const [password,setPassword]=useState('')
  const [passwordLoading,setPasswordLoading]=useState(false)
  const [message,setMessage]=useState('')
  const [error,setError]=useState('')
  const telegramCallbackStarted=useRef(false)

  useEffect(()=>{
    let cancelled=false
    void prepareTelegramWebLogin()
      .then(links=>{
        if(cancelled)return
        setTelegramAppUrl(links.appUrl)
        setTelegramWebUrl(links.webUrl)
        setTelegramReady(true)
      })
      .catch(()=>{
        if(!cancelled)setTelegramReady(false)
      })
    return()=>{cancelled=true}
  },[])

  useEffect(()=>{
    if(!hasTelegramWebLoginCallback()||telegramCallbackStarted.current)return
    telegramCallbackStarted.current=true
    setTelegramLoading(true);setError('')
    void completeTelegramWebLogin()
      .then(()=>onAuthenticated())
      .catch(e=>setError(e instanceof Error?e.message:'Не удалось войти через Telegram.'))
      .finally(()=>setTelegramLoading(false))
  },[onAuthenticated])

  async function passwordLogin(e:React.FormEvent){
    e.preventDefault()
    if(passwordLoading||!supabase)return
    const normalized=login.trim().toLowerCase()
    if(!normalized){setError('Укажи логин или email.');return}
    if(!password){setError('Укажи пароль.');return}
    const email=normalized.includes('@')?normalized:normalized+'@users.andreway.ru'
    setPasswordLoading(true);setError('');setMessage('')
    try{
      const {data,error:authError}=await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if(authError||!data.user){
        setError('Не удалось войти. Проверь логин и пароль.')
        return
      }
      onAuthenticated()
    }catch{
      setError('Сервис входа не отвечает. Проверь соединение и попробуй ещё раз.')
    }finally{
      setPasswordLoading(false)
    }
  }

  async function resetPassword(){
    if(passwordLoading||!supabase)return
    const normalized=login.trim().toLowerCase()
    if(!normalized){setError('Сначала укажи email.');return}
    if(!normalized.includes('@')){
      setError('Для короткого логина новый временный пароль выдаёт тренер.')
      return
    }
    setPasswordLoading(true);setError('');setMessage('')
    try{
      const {error:resetError}=await supabase.auth.resetPasswordForEmail(normalized,{
        redirectTo:getAppBaseUrl()+'?reset=1#/',
      })
      if(resetError)throw resetError
      setMessage('Ссылка для смены пароля отправлена на почту.')
    }catch{
      setError('Не удалось отправить ссылку для смены пароля.')
    }finally{
      setPasswordLoading(false)
    }
  }

  return <div className="login-page">
    <div className="login-visual">
      <div className="login-brand"><div className="brand-mark large"><Activity size={26}/></div><span>Andrey-Fit</span></div>
      <div className="login-copy"><span className="kicker">Сопровождение с тренером</span><h1>Тренировки, питание и прогресс в одном месте.</h1><p>Входи по логину и паролю. Telegram остаётся быстрым дополнительным способом входа и каналом уведомлений.</p></div>
      <div className="secure-note"><ShieldCheck size={20}/><span>Andrey-Fit открывает только данные твоего профиля и сохраняет сессию на этом устройстве.</span></div>
    </div>

    <div className="login-panel">
      <div className="login-form-wrap">
        <h2>Войти в Andrey-Fit</h2>
        <p className="muted">Основной вход — по короткому логину тренера или по email старого аккаунта.</p>

        <form className="login-form" onSubmit={passwordLogin}>
          <label>Логин или email<input value={login} onChange={e=>setLogin(e.target.value.replace(/\s/g,''))} placeholder="ivan-p или name@example.com" required autoCapitalize="none" autoCorrect="off" autoComplete="username"/></label>
          <label>Пароль<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required autoComplete="current-password"/></label>
          <button type="button" className="forgot-password-button" disabled={passwordLoading} onClick={()=>void resetPassword()}>Не помню пароль</button>
          {message&&<div className="form-success">{message}</div>}
          <button className="primary-button" disabled={passwordLoading}>{passwordLoading?'Входим…':'Войти'}<ArrowRight size={18}/></button>
        </form>

        <p className="muted">или</p>

        {telegramReady===null
          ?<div className="form-success">Готовим вход через Telegram…</div>
          :telegramReady&&telegramAppUrl
            ?<>
              <a className="primary-button secondary" href={telegramAppUrl} onClick={()=>{setError('');setTelegramLoading(true)}}><Send size={18}/>{telegramLoading?'Открываем Telegram…':'Войти через Telegram'}</a>
              <a className="forgot-password-button" href={telegramWebUrl}>Открыть Telegram в браузере</a>
            </>
            :<div className="form-error">Не удалось подготовить вход через Telegram. Используй логин и пароль.</div>}
        <p className="muted">Не помнишь пароль? Напиши тренеру — он может выдать новый временный пароль.</p>
        {error&&<div className="form-error">{error}</div>}
      </div>
    </div>
  </div>
}
