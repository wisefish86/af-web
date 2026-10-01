// Adaptive installer for browser-specific PWA installation flows.
import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Copy, Download, ExternalLink, MoreVertical, Share2, Smartphone } from 'lucide-react'

type InstallPromptEvent=Event&{
  prompt:()=>Promise<void>
  userChoice:Promise<{outcome:'accepted'|'dismissed'}>
}
type InstallWindow=Window&{__andreyFitInstallPrompt?:InstallPromptEvent}
type IOSNavigator=Navigator&{standalone?:boolean}

type BrowserInfo={
  platform:'android'|'ios'|'desktop'
  browser:'chrome'|'samsung'|'edge'|'firefox'|'safari'|'other'
  label:string
}

function getBrowserInfo():BrowserInfo{
  const ua=navigator.userAgent
  const android=/Android/i.test(ua)
  const ios=/iPhone|iPad|iPod/i.test(ua)
  const samsung=/SamsungBrowser/i.test(ua)
  const edge=/EdgA|EdgiOS|Edg\//i.test(ua)
  const firefox=/Firefox|FxiOS/i.test(ua)
  const chrome=/Chrome|CriOS/i.test(ua) && !edge && !samsung
  const safari=/Safari/i.test(ua) && !/Chrome|CriOS|Edg|FxiOS|SamsungBrowser/i.test(ua)

  if(android){
    if(samsung)return {platform:'android',browser:'samsung',label:'Samsung Internet'}
    if(edge)return {platform:'android',browser:'edge',label:'Microsoft Edge'}
    if(firefox)return {platform:'android',browser:'firefox',label:'Firefox'}
    if(chrome)return {platform:'android',browser:'chrome',label:'Google Chrome'}
    return {platform:'android',browser:'other',label:'браузер Android'}
  }

  if(ios){
    if(safari)return {platform:'ios',browser:'safari',label:'Safari'}
    if(chrome)return {platform:'ios',browser:'chrome',label:'Chrome'}
    if(edge)return {platform:'ios',browser:'edge',label:'Edge'}
    if(firefox)return {platform:'ios',browser:'firefox',label:'Firefox'}
    return {platform:'ios',browser:'other',label:'браузер iPhone'}
  }

  if(edge)return {platform:'desktop',browser:'edge',label:'Microsoft Edge'}
  if(chrome)return {platform:'desktop',browser:'chrome',label:'Google Chrome'}
  if(firefox)return {platform:'desktop',browser:'firefox',label:'Firefox'}
  if(safari)return {platform:'desktop',browser:'safari',label:'Safari'}
  return {platform:'desktop',browser:'other',label:'браузер'}
}

function AndroidAlternatives(){
  const openBrowser=(packageName:string)=>{
    const fallback=encodeURIComponent('https://fit.andreway.ru/')
    window.location.href=`intent://fit.andreway.ru/#Intent;scheme=https;package=${packageName};S.browser_fallback_url=${fallback};end`
  }

  return <div className="pwa-alternatives">
    <div className="pwa-alt-copy">
      <strong>Если «Установить» недоступно</strong>
      <span>Это бывает из-за ограничений конкретного Chrome/сети. Сам сайт поддерживает установку. Попробуй другой браузер.</span>
    </div>
    <div className="pwa-alt-actions">
      <button className="ghost-button compact" onClick={()=>openBrowser('com.chrome.beta')}><ExternalLink size={15}/>Chrome Beta</button>
      <button className="ghost-button compact" onClick={()=>openBrowser('com.sec.android.app.sbrowser')}><ExternalLink size={15}/>Samsung Internet</button>
    </div>
    <div className="pwa-fallback-note">Если полноценная установка недоступна, в меню браузера можно выбрать <b>«Создать ярлык»</b>. Он будет открывать Andrey Fit в браузере.</div>
  </div>
}

export function PwaInstallPanel(){
  const info=useMemo(getBrowserInfo,[])
  const [installAvailable,setInstallAvailable]=useState(Boolean((window as InstallWindow).__andreyFitInstallPrompt))
  const [installed,setInstalled]=useState(
    ()=>window.matchMedia('(display-mode: standalone)').matches||Boolean((navigator as IOSNavigator).standalone),
  )
  const [moreOpen,setMoreOpen]=useState(false)
  const [installing,setInstalling]=useState(false)
  const [notice,setNotice]=useState('')

  useEffect(()=>{
    const syncInstall=()=>setInstallAvailable(Boolean((window as InstallWindow).__andreyFitInstallPrompt))
    const markInstalled=()=>{setInstalled(true);setInstallAvailable(false);setNotice('')}
    const markConsumed=()=>setInstallAvailable(false)
    syncInstall()
    window.addEventListener('andrey-fit-install-available',syncInstall)
    window.addEventListener('andrey-fit-app-installed',markInstalled)
    window.addEventListener('andrey-fit-install-consumed',markConsumed)
    return ()=>{
      window.removeEventListener('andrey-fit-install-available',syncInstall)
      window.removeEventListener('andrey-fit-app-installed',markInstalled)
      window.removeEventListener('andrey-fit-install-consumed',markConsumed)
    }
  },[])

  async function install(){
    const prompt=(window as InstallWindow).__andreyFitInstallPrompt
    if(!prompt||installing)return
    setInstalling(true);setNotice('')
    try{
      await prompt.prompt()
      const result=await prompt.userChoice
      delete (window as InstallWindow).__andreyFitInstallPrompt
      setInstallAvailable(false)
      window.dispatchEvent(new Event('andrey-fit-install-consumed'))
      if(result.outcome==='dismissed')setNotice('Установка отменена. Её можно запустить снова через меню браузера.')
    }catch{
      delete (window as InstallWindow).__andreyFitInstallPrompt
      setInstallAvailable(false)
      window.dispatchEvent(new Event('andrey-fit-install-consumed'))
      setNotice('Браузер не смог открыть установку. Используй меню браузера или один из способов ниже.')
    }finally{setInstalling(false)}
  }

  async function copyLink(){
    try{
      await navigator.clipboard.writeText('https://fit.andreway.ru/')
      setNotice('Ссылка скопирована.')
    }catch{
      setNotice('Открой в Safari: fit.andreway.ru')
    }
  }

  if(installed){
    return <section className="panel preference-panel pwa-install-panel is-installed">
      <div className="panel-head"><div><span className="eyebrow">Приложение</span><h3>Andrey Fit установлен</h3></div><Smartphone size={19}/></div>
      <p className="panel-description">Ты уже открыл Andrey Fit как отдельное приложение.</p>
    </section>
  }

  return <section className="panel preference-panel pwa-install-panel">
    <div className="panel-head"><div><span className="eyebrow">Приложение</span><h3>Установить Andrey Fit</h3></div><Smartphone size={19}/></div>
    <p className="panel-description">Сейчас открыт {info.label}. Выбери удобный способ — после установки Andrey Fit будет открываться отдельным окном с собственной иконкой.</p>

    {installAvailable&&<div className="pwa-primary-install">
      <button className="primary-button" disabled={installing} onClick={()=>void install()}><Download size={18}/>{installing?'Открываю установку…':'Установить приложение'}</button>
      <span>Браузер разрешил полноценную установку.</span>
    </div>}

    {!installAvailable&&info.platform==='android'&&<>
      <div className="pwa-method-card is-recommended">
        <div className="pwa-method-icon"><MoreVertical size={20}/></div>
        <div>
          <strong>{info.browser==='samsung'?'Установить через Samsung Internet':'Установить через меню браузера'}</strong>
          {info.browser==='samsung'
            ? <span>Открой меню Samsung Internet → <b>Добавить страницу в</b> → <b>Главный экран / Установить приложение</b>.</span>
            : <span>Нажми <b>⋮</b> → <b>Установить и создать ярлык</b> → <b>Установить</b>.</span>}
        </div>
      </div>
      <AndroidAlternatives/>
    </>}

    {!installAvailable&&info.platform==='ios'&&info.browser==='safari'&&
      <div className="pwa-method-card is-recommended">
        <div className="pwa-method-icon"><Share2 size={20}/></div>
        <div>
          <strong>Установить через Safari</strong>
          <span>Нажми <b>Поделиться</b> → <b>На экран «Домой»</b> → включи <b>«Открывать как веб-приложение»</b> → <b>Добавить</b>.</span>
        </div>
      </div>}

    {!installAvailable&&info.platform==='ios'&&info.browser!=='safari'&&
      <div className="pwa-method-card is-recommended">
        <div className="pwa-method-icon"><Share2 size={20}/></div>
        <div>
          <strong>Открой сайт в Safari</strong>
          <span>На iPhone самый надёжный способ установки: Safari → <b>Поделиться</b> → <b>На экран «Домой»</b> → <b>Добавить</b>.</span>
          <button className="ghost-button compact pwa-copy-link" onClick={()=>void copyLink()}><Copy size={15}/>Скопировать адрес</button>
        </div>
      </div>}

    {!installAvailable&&info.platform==='desktop'&&
      <div className="pwa-method-card is-recommended">
        <div className="pwa-method-icon"><Download size={20}/></div>
        <div>
          <strong>Установить на компьютер</strong>
          <span>В Chrome или Edge нажми значок установки в адресной строке либо меню браузера → <b>Установить Andrey Fit</b>.</span>
        </div>
      </div>}

    {notice&&<div className="pwa-user-notice">{notice}</div>}

    <button className="pwa-more-toggle" onClick={()=>setMoreOpen(v=>!v)}>
      <span>Другие способы установки</span><ChevronDown size={17} className={moreOpen?'is-open':''}/>
    </button>

    {moreOpen&&<div className="pwa-more-content">
      {info.platform!=='android'&&<div><strong>Android</strong><span>Chrome / Chrome Beta / Samsung Internet → меню браузера → «Установить приложение» или «Добавить на главный экран».</span></div>}
      {info.platform!=='ios'&&<div><strong>iPhone / iPad</strong><span>Safari → «Поделиться» → «На экран Домой» → «Открывать как веб-приложение».</span></div>}
      <div><strong>Запасной вариант</strong><span>Если браузер не поддерживает полноценную установку, создай ярлык. Он всё равно будет быстро открывать Andrey Fit.</span></div>
    </div>}
  </section>
}
