export type TelegramMiniAppUser={
  id:number
  first_name?:string
  last_name?:string
  username?:string
  language_code?:string
}

type TelegramWebApp={
  initData?:string
  initDataUnsafe?:{user?:TelegramMiniAppUser;start_param?:string}
  platform?:string
  colorScheme?:'light'|'dark'
  ready?:()=>void
  expand?:()=>void
  close?:()=>void
  setHeaderColor?:(color:string)=>void
  setBackgroundColor?:(color:string)=>void
}

type TelegramWindow=Window & {Telegram?:{WebApp?:TelegramWebApp}}

export function getTelegramWebApp(){
  return (window as TelegramWindow).Telegram?.WebApp??null
}

export function getTelegramInitData(){
  const webApp=getTelegramWebApp()
  if(webApp?.initData)return webApp.initData
  return new URLSearchParams(window.location.search).get('tgWebAppData')??''
}

export function isTelegramMiniApp(){
  return Boolean(getTelegramInitData())
}

export function prepareTelegramMiniApp(){
  const webApp=getTelegramWebApp()
  if(!webApp)return
  webApp.ready?.()
  webApp.expand?.()
  try{
    webApp.setHeaderColor?.('#0b1320')
    webApp.setBackgroundColor?.('#f4f6f8')
  }catch{}
}

export function getTelegramUnsafeUser(){
  return getTelegramWebApp()?.initDataUnsafe?.user??null
}
