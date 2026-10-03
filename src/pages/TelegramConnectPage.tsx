import { useState } from 'react'
import type { TelegramMiniAppUser } from '../lib/telegram'

type Props={
  mode:'unlinked'|'error'
  user?:TelegramMiniAppUser|null
  message?:string
  onRetry:()=>void
  onBindOwner?:(email:string,password:string)=>Promise<void>
}

export function TelegramConnectPage({mode,user,message,onRetry,onBindOwner}:Props){
  const name=user?.first_name?.trim()||''
  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')
  const [binding,setBinding]=useState(false)
  const [bindError,setBindError]=useState('')
  const title=mode==='unlinked'
    ?(name?name+', Telegram распознан':'Telegram распознан')
    :'Не удалось войти через Telegram'

  async function bind(e:React.FormEvent){
    e.preventDefault()
    if(!onBindOwner)return
    setBinding(true)
    setBindError('')
    try{await onBindOwner(email,password)}
    catch(error){setBindError(error instanceof Error?error.message:'Не удалось привязать Telegram.')}
    finally{setBinding(false)}
  }

  return <div className="telegram-entry-page">
    <div className="telegram-entry-card">
      <div className="telegram-entry-mark">AF</div>
      <div>
        <span className="telegram-entry-kicker">Andrey-Fit · Telegram</span>
        <h1>{title}</h1>
      </div>
      {mode==='unlinked'
        ?<><p>Это первая настройка твоего Telegram. Один раз подтверди тренерский кабинет — после этого Andrey-Fit будет входить без логина и пароля.</p>
          {onBindOwner&&<form className="telegram-bind-form" onSubmit={bind}>
            <label>Email тренера<input type="email" value={email} onChange={e=>setEmail(e.target.value.replace(/\s/g,''))} autoComplete="username" required placeholder="trainer@example.com"/></label>
            <label>Пароль<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required placeholder="••••••••"/></label>
            {bindError&&<div className="form-error">{bindError}</div>}
            <button className="primary-button telegram-retry" disabled={binding}>{binding?'Привязываем…':'Привязать Telegram и войти'}</button>
          </form>}
          <div className="telegram-entry-note">Привязка разрешена только для твоего тренерского аккаунта. Другие тренеры в текущей версии не подключаются.</div></>
        :<><p>{message||'Проверь соединение и попробуй ещё раз.'}</p>
          <button className="primary-button telegram-retry" onClick={onRetry}>Повторить вход</button></>}
    </div>
  </div>
}
