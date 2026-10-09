import { useEffect, useRef } from 'react'

export type TelegramWidgetAuthData={
  id:number|string
  first_name?:string
  last_name?:string
  username?:string
  photo_url?:string
  auth_date:number|string
  hash:string
}

declare global{
  interface Window{
    __andreyFitTelegramAuth?:(user:TelegramWidgetAuthData)=>void
  }
}

export function TelegramLoginWidget({onAuth,disabled=false}:{onAuth:(user:TelegramWidgetAuthData)=>void;disabled?:boolean}){
  const hostRef=useRef<HTMLDivElement|null>(null)
  const onAuthRef=useRef(onAuth)
  useEffect(()=>{onAuthRef.current=onAuth},[onAuth])

  useEffect(()=>{
    const host=hostRef.current
    if(!host||disabled)return
    host.innerHTML=''
    window.__andreyFitTelegramAuth=(user)=>onAuthRef.current(user)

    const script=document.createElement('script')
    script.async=true
    script.src='https://telegram.org/js/telegram-widget.js?22'
    script.setAttribute('data-telegram-login','andreyfit_bot')
    script.setAttribute('data-size','large')
    script.setAttribute('data-radius','10')
    script.setAttribute('data-lang','ru')
    script.setAttribute('data-userpic','false')
    script.setAttribute('data-request-access','write')
    script.setAttribute('data-onauth','__andreyFitTelegramAuth(user)')
    host.appendChild(script)

    return()=>{
      if(window.__andreyFitTelegramAuth)delete window.__andreyFitTelegramAuth
      host.innerHTML=''
    }
  },[disabled])

  return <div className="telegram-login-widget" ref={hostRef} aria-label="Подключить Telegram"/>
}
