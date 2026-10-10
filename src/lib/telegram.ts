export type TelegramMiniAppUser={
  id:number
  first_name?:string
  last_name?:string
  username?:string
  language_code?:string
  allows_write_to_pm?:boolean
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
  requestWriteAccess?:(callback?:(granted:boolean)=>void)=>void
  BackButton?:{
    isVisible?:boolean
    show?:()=>void
    hide?:()=>void
    onClick?:(callback:()=>void)=>void
    offClick?:(callback:()=>void)=>void
  }
}

type TelegramWindow=Window & {Telegram?:{WebApp?:TelegramWebApp}}

function webAppNow(){
  return (window as TelegramWindow).Telegram?.WebApp??null
}

function launchParam(name:string){
  const searchValue=new URLSearchParams(window.location.search).get(name)
  if(searchValue)return searchValue
  const rawHash=window.location.hash.startsWith('#')?window.location.hash.slice(1):window.location.hash
  if(!rawHash||rawHash.startsWith('/'))return ''
  return new URLSearchParams(rawHash).get(name)??''
}

// Telegram injects launch parameters into the URL fragment. Cache them before
// HashRouter can replace the fragment with an application route.
const initialTelegramInitData=webAppNow()?.initData||launchParam('tgWebAppData')
const initialTelegramStartParam=webAppNow()?.initDataUnsafe?.start_param||launchParam('tgWebAppStartParam')

// HashRouter and Telegram both use location.hash. Once the launch payload is
// cached, normalize only Telegram's launch fragment into the app root route.
if(initialTelegramInitData){
  const rawHash=window.location.hash.startsWith('#')?window.location.hash.slice(1):window.location.hash
  if(rawHash.includes('tgWebAppData=')){
    window.history.replaceState(window.history.state,'',window.location.pathname+window.location.search+'#/')
  }
}

export function getTelegramWebApp(){
  return webAppNow()
}

export function getTelegramInitData(){
  return webAppNow()?.initData||initialTelegramInitData||''
}

export function getTelegramStartParam(){
  return webAppNow()?.initDataUnsafe?.start_param||initialTelegramStartParam||''
}

// Andrey-Fit runs as a regular web/PWA client. Telegram is used for OAuth and bot notifications only.
export function isTelegramMiniApp(){
  return false
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
  const direct=getTelegramWebApp()?.initDataUnsafe?.user
  if(direct)return direct
  try{
    const raw=new URLSearchParams(initialTelegramInitData).get('user')
    return raw?JSON.parse(raw) as TelegramMiniAppUser:null
  }catch{return null}
}

export function setupTelegramBackButton(visible:boolean,onClick:()=>void){
  const button=getTelegramWebApp()?.BackButton
  if(!button)return()=>undefined
  if(visible){
    button.show?.()
    button.onClick?.(onClick)
  }else{
    button.hide?.()
  }
  return()=>{
    button.offClick?.(onClick)
    if(visible)button.hide?.()
  }
}


export function requestTelegramWriteAccess():Promise<boolean>{
  return new Promise(resolve=>{
    const webApp=getTelegramWebApp()
    if(!webApp?.requestWriteAccess){resolve(false);return}
    try{
      webApp.requestWriteAccess(granted=>resolve(Boolean(granted)))
    }catch{
      resolve(false)
    }
  })
}
