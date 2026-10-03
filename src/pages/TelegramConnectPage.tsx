import { useState } from 'react'
import type { TelegramMiniAppUser } from '../lib/telegram'
import { UiButton, UiCard, UiNotice, UiStack } from '../ui/primitives'

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
    <UiCard className="telegram-entry-card">
      <div className="telegram-entry-mark">AF</div>
      <div>
        <span className="ui-kicker">Andrey-Fit · Telegram</span>
        <h1 className="ui-page-title">{title}</h1>
      </div>
      {mode==='unlinked'
        ?<><p className="ui-body">Это первая настройка твоего Telegram. Один раз подтверди основной аккаунт тренера — только чтобы связать этот Telegram с тестовым клиентом и будущими уведомлениями.</p>
          {onBindOwner&&<form className="ui-stack ui-stack--sm telegram-bind-form" onSubmit={bind}>
            <label className="ui-field">Email тренера<input type="email" value={email} onChange={e=>setEmail(e.target.value.replace(/\s/g,''))} autoComplete="username" required placeholder="trainer@example.com"/></label>
            <label className="ui-field">Пароль<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required placeholder="••••••••"/></label>
            {bindError&&<UiNotice tone="warning">{bindError}</UiNotice>}
            <UiButton className="telegram-retry" disabled={binding}>{binding?'Привязываем…':'Подтвердить и открыть клиентское приложение'}</UiButton>
          </form>}
          <UiNotice>Тренерский кабинет через Telegram не открывается. Для работы тренера остаются сайт на ПК и PWA на Android.</UiNotice></>
        :<><p className="ui-body">{message||'Проверь соединение и попробуй ещё раз.'}</p>
          <UiButton className="telegram-retry" onClick={onRetry}>Повторить вход</UiButton></>}
    </UiCard>
  </div>
}
