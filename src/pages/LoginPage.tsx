import { useEffect, useRef, useState } from 'react'
import { Activity, ArrowRight, Send, ShieldCheck } from 'lucide-react'
import { completeTelegramWebLogin, hasTelegramWebLoginCallback, prepareTelegramWebLogin } from '../features/telegram/webLogin'
import { supabase } from '../lib/supabase'
import { loadAccessHelp, type AccessHelp } from '../features/access/service'

type Props={onAuthenticated:()=>void}

export function LoginPage({onAuthenticated}:Props){
  const visualPreview=new URLSearchParams(window.location.search).get('visual')==='login'
  const [telegramAppUrl,setTelegramAppUrl]=useState(visualPreview?'tg://resolve?domain=andrey_fit_bot':'')
  const [telegramReady,setTelegramReady]=useState<boolean|null>(null)
  const [telegramLoading,setTelegramLoading]=useState(false)
  const [login,setLogin]=useState('')
  const [password,setPassword]=useState('')
  const [passwordLoading,setPasswordLoading]=useState(false)
  const [helpLoading,setHelpLoading]=useState(false)
  const [accessHelp,setAccessHelp]=useState<AccessHelp|null>(null)
  const [error,setError]=useState('')
  const telegramCallbackStarted=useRef(false)

  useEffect(()=>{
    if(visualPreview){setTelegramReady(true);return}
    let cancelled=false
    void prepareTelegramWebLogin()
      .then(links=>{
        if(cancelled)return
        setTelegramAppUrl(links.appUrl)
        setTelegramReady(true)
      })
      .catch(()=>{
        if(!cancelled)setTelegramReady(false)
      })
    return()=>{cancelled=true}
  },[visualPreview])

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
    if(!normalized){setError('Укажи логин.');return}
    if(!password){setError('Укажи пароль.');return}
    const email=normalized+'@users.andreway.ru'
    setPasswordLoading(true);setError('');setAccessHelp(null)
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

  async function showPasswordHelp(){
    const normalized=login.trim().toLowerCase()
    if(!normalized){setError('Сначала укажи логин.');return}
    if(helpLoading)return
    setHelpLoading(true);setError('');setAccessHelp(null)
    try{
      setAccessHelp(await loadAccessHelp(normalized))
    }catch{
      setError('Не удалось получить контакты тренера. Попробуй ещё раз.')
    }finally{
      setHelpLoading(false)
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
        <p className="muted">Введи свой логин и пароль. При первом входе тренер выдаёт временный пароль.</p>

        <form className="login-form" onSubmit={passwordLogin}>
          <label>Логин<input value={login} onChange={e=>{setLogin(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g,''));setAccessHelp(null)}} placeholder="Например, ivan-p" required autoCapitalize="none" autoCorrect="off" autoComplete="username"/></label>
          <label>Пароль<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required autoComplete="current-password"/></label>
          <button type="button" className="forgot-password-button" disabled={helpLoading||passwordLoading} onClick={()=>void showPasswordHelp()}>{helpLoading?'Ищу контакты…':'Не помню пароль'}</button>
          {accessHelp&&<div className="form-success">
            <div>{accessHelp.trainer_name?'Новый временный пароль выдаёт '+accessHelp.trainer_name+'.':'Новый временный пароль выдаёт тренер.'}</div>
            {accessHelp.contacts.length>0&&<div className="login-help-links">{accessHelp.contacts.map(contact=><a key={contact.channel+contact.url} href={contact.url} target="_blank" rel="noreferrer">{contact.label||contact.channel}</a>)}</div>}
          </div>}
          <button className="primary-button" disabled={passwordLoading}>{passwordLoading?'Входим…':'Войти'}<ArrowRight size={18}/></button>
        </form>

        <p className="muted">или</p>

        {telegramReady===null
          ?<div className="form-success">Готовим вход через Telegram…</div>
          :telegramReady&&telegramAppUrl
            ?<div className="telegram-login-block">
              <a className="primary-button secondary" href={telegramAppUrl} onClick={()=>{setError('');setTelegramLoading(true)}}><Send size={18}/>{telegramLoading?'Открываем Telegram…':'Войти через Telegram'}</a>
              <div className="telegram-login-hint">Откроется установленное приложение Telegram.</div>
            </div>
            :<div className="form-error">Не удалось подготовить вход через Telegram. Используй логин и пароль.</div>}
        <p className="muted login-password-note">Если пароль забыт, тренер выдаст новый временный — почта для восстановления не требуется.</p>
        {error&&<div className="form-error">{error}</div>}
        <a className="trainer-access-link" href="/?app=trainer#/trainer-access">Вход для тренера</a>
      </div>
    </div>
  </div>
}
