import { useEffect, useRef, useState } from 'react'
import type { TelegramWidgetAuthData } from '../features/telegram/service'

type Props={
  onAuth:(data:TelegramWidgetAuthData)=>Promise<void>|void
}

declare global{
  interface Window{
    __andreyFitTelegramAuth?:(user:TelegramWidgetAuthData)=>void
  }
}

export function TelegramLoginWidget({onAuth}:Props){
  const ref=useRef<HTMLDivElement|null>(null)
  const authRef=useRef(onAuth)
  const [loadFailed,setLoadFailed]=useState(false)

  useEffect(()=>{authRef.current=onAuth},[onAuth])

  useEffect(()=>{
    const host=ref.current
    if(!host)return

    setLoadFailed(false)
    host.innerHTML=''
    window.__andreyFitTelegramAuth=(user)=>{void authRef.current(user)}

    const script=document.createElement('script')
    script.async=true
    script.src='https://telegram.org/js/telegram-widget.js?22'
    script.setAttribute('data-telegram-login','andreyfit_bot')
    script.setAttribute('data-size','large')
    script.setAttribute('data-radius','10')
    script.setAttribute('data-userpic','false')
    script.setAttribute('data-request-access','write')
    script.setAttribute('data-lang','ru')
    script.setAttribute('data-onauth','__andreyFitTelegramAuth(user)')
    script.onerror=()=>setLoadFailed(true)
    host.appendChild(script)

    return()=>{
      delete window.__andreyFitTelegramAuth
      host.innerHTML=''
    }
  },[])

  return <div className="telegram-login-widget-wrap">
    <div ref={ref}/>
    {loadFailed&&<small>Не удалось загрузить авторизацию Telegram. Проверь соединение и попробуй ещё раз.</small>}
  </div>
}
