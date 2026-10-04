import { useEffect, useRef, useState } from 'react'
import { Activity, Send, ShieldCheck } from 'lucide-react'
import { beginTelegramWebLogin, completeTelegramWebLogin, hasTelegramWebLoginCallback, isTelegramWebLoginAvailable } from '../features/telegram/webLogin'

type Props={onAuthenticated:()=>void}

export function LoginPage({onAuthenticated}:Props){
  const [telegramAvailable,setTelegramAvailable]=useState(false)
  const [telegramLoading,setTelegramLoading]=useState(false)
  const [error,setError]=useState('')
  const telegramCallbackStarted=useRef(false)

  useEffect(()=>{
    let cancelled=false
    void isTelegramWebLoginAvailable().then(value=>{
      if(!cancelled)setTelegramAvailable(value)
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

  async function telegramLogin(){
    if(telegramLoading)return
    setTelegramLoading(true);setError('')
    try{
      await beginTelegramWebLogin()
    }catch(e){
      setError(e instanceof Error?e.message:'Не удалось открыть вход через Telegram.')
      setTelegramLoading(false)
    }
  }

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
        {telegramAvailable
          ?<button type="button" className="primary-button" disabled={telegramLoading} onClick={()=>void telegramLogin()}><Send size={18}/>{telegramLoading?'Открываем Telegram…':'Войти через Telegram'}</button>
          :<div className="form-success">Вход через Telegram временно недоступен. Попробуй ещё раз позже или сообщи тренеру.</div>}
        {error&&<div className="form-error">{error}</div>}
      </div>
    </div>
  </div>
}
