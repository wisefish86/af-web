import { useEffect, useRef, useState } from 'react'
import { Activity, Send, ShieldCheck } from 'lucide-react'
import { completeTelegramWebLogin, hasTelegramWebLoginCallback, prepareTelegramWebLogin } from '../features/telegram/webLogin'

type Props={onAuthenticated:()=>void}

export function LoginPage({onAuthenticated}:Props){
  const [telegramUrl,setTelegramUrl]=useState('')
  const [telegramReady,setTelegramReady]=useState<boolean|null>(null)
  const [telegramLoading,setTelegramLoading]=useState(false)
  const [error,setError]=useState('')
  const telegramCallbackStarted=useRef(false)

  useEffect(()=>{
    let cancelled=false
    void prepareTelegramWebLogin()
      .then(url=>{
        if(cancelled)return
        setTelegramUrl(url)
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

  return <div className="login-page">
    <div className="login-visual">
      <div className="login-brand"><div className="brand-mark large"><Activity size={26}/></div><span>Andrey-Fit</span></div>
      <div className="login-copy"><span className="kicker">Сопровождение с тренером</span><h1>Тренировки, питание и прогресс в одном месте.</h1><p>Вход без логинов и паролей — через твой Telegram.</p></div>
      <div className="secure-note"><ShieldCheck size={20}/><span>Telegram подтверждает твою личность, а Andrey-Fit открывает только твои данные.</span></div>
    </div>

    <div className="login-panel">
      <div className="login-form-wrap">
        <h2>Войти в Andrey-Fit</h2>
        <p className="muted">Используй тот Telegram, который подключён к твоему сопровождению.</p>
        {telegramReady===null
          ?<div className="form-success">Готовим вход через Telegram…</div>
          :telegramReady&&telegramUrl
            ?<a className="primary-button" href={telegramUrl} onClick={()=>{setError('');setTelegramLoading(true)}}><Send size={18}/>Войти через Telegram</a>
            :<div className="form-error">Не удалось подготовить вход через Telegram. Обнови страницу и попробуй ещё раз.</div>}
        {error&&<div className="form-error">{error}</div>}
      </div>
    </div>
  </div>
}
