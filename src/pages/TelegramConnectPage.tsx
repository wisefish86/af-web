import type { TelegramMiniAppUser } from '../lib/telegram'

type Props={
  mode:'unlinked'|'error'
  user?:TelegramMiniAppUser|null
  message?:string
  onRetry:()=>void
}

export function TelegramConnectPage({mode,user,message,onRetry}:Props){
  const name=user?.first_name?.trim()||''
  const title=mode==='unlinked'
    ?(name?name+', Telegram распознан':'Telegram распознан')
    :'Не удалось войти через Telegram'
  return <div className="telegram-entry-page">
    <div className="telegram-entry-card">
      <div className="telegram-entry-mark">AF</div>
      <div>
        <span className="telegram-entry-kicker">Andrey-Fit · Telegram</span>
        <h1>{title}</h1>
      </div>
      {mode==='unlinked'
        ?<><p>Этот Telegram-аккаунт пока не связан с кабинетом Andrey-Fit. Логин и пароль здесь вводить не нужно.</p>
          <div className="telegram-entry-note">Следующий шаг — персональная привязка к профилю. После неё приложение будет открываться сразу в твоём кабинете.</div></>
        :<><p>{message||'Проверь соединение и попробуй ещё раз.'}</p>
          <button className="primary-button telegram-retry" onClick={onRetry}>Повторить вход</button></>}
    </div>
  </div>
}
