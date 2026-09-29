import { useEffect, useState } from 'react'
import { Download, Smartphone } from 'lucide-react'

type InstallPromptEvent=Event&{
  prompt:()=>Promise<void>
  userChoice:Promise<{outcome:'accepted'|'dismissed'}>
}
type InstallWindow=Window&{__andreyFitInstallPrompt?:InstallPromptEvent}

type CheckState='checking'|'ok'|'bad'
type Diagnostics={
  manifest:CheckState
  manifestType:string
  serviceWorker:CheckState
  controlled:boolean
}

function validateManifest(data:unknown){
  if(!data||typeof data!=='object')return false
  const m=data as Record<string,unknown>
  const icons=Array.isArray(m.icons)?m.icons as Array<Record<string,unknown>>:[]
  const has192=icons.some(i=>String(i.sizes??'').split(/\\s+/).includes('192x192'))
  const has512=icons.some(i=>String(i.sizes??'').split(/\\s+/).includes('512x512'))
  return Boolean(
    (m.name||m.short_name)&&
    m.start_url&&
    ['standalone','fullscreen','minimal-ui','window-controls-overlay'].includes(String(m.display))&&
    has192&&has512&&
    m.prefer_related_applications!==true
  )
}

export function PwaInstallPanel(){
  const [installAvailable,setInstallAvailable]=useState(Boolean((window as InstallWindow).__andreyFitInstallPrompt))
  const [installed,setInstalled]=useState(()=>window.matchMedia('(display-mode: standalone)').matches)
  const [message,setMessage]=useState('')
  const [waited,setWaited]=useState(false)
  const [diag,setDiag]=useState<Diagnostics>({
    manifest:'checking',
    manifestType:'',
    serviceWorker:'checking',
    controlled:Boolean(navigator.serviceWorker?.controller),
  })

  async function runChecks(){
    try{
      const response=await fetch('/manifest.json',{cache:'no-store'})
      const type=response.headers.get('content-type')||''
      const data=await response.json()
      setDiag(d=>({...d,manifest:response.ok&&validateManifest(data)?'ok':'bad',manifestType:type}))
    }catch{
      setDiag(d=>({...d,manifest:'bad'}))
    }

    if(!('serviceWorker' in navigator)){
      setDiag(d=>({...d,serviceWorker:'bad',controlled:false}))
      return
    }

    try{
      const registration=await navigator.serviceWorker.ready
      setDiag(d=>({...d,serviceWorker:registration.active?'ok':'bad',controlled:Boolean(navigator.serviceWorker.controller)}))
    }catch{
      setDiag(d=>({...d,serviceWorker:'bad'}))
    }
  }

  useEffect(()=>{
    const syncInstall=()=>setInstallAvailable(Boolean((window as InstallWindow).__andreyFitInstallPrompt))
    const markInstalled=()=>{setInstalled(true);setInstallAvailable(false)}
    const controllerChanged=()=>setDiag(d=>({...d,controlled:Boolean(navigator.serviceWorker?.controller)}))
    void runChecks()
    const timer=window.setTimeout(()=>setWaited(true),35000)
    window.addEventListener('andrey-fit-install-available',syncInstall)
    window.addEventListener('andrey-fit-app-installed',markInstalled)
    navigator.serviceWorker?.addEventListener('controllerchange',controllerChanged)
    return ()=>{
      window.clearTimeout(timer)
      window.removeEventListener('andrey-fit-install-available',syncInstall)
      window.removeEventListener('andrey-fit-app-installed',markInstalled)
      navigator.serviceWorker?.removeEventListener('controllerchange',controllerChanged)
    }
  },[])

  async function install(){
    setMessage('')
    const prompt=(window as InstallWindow).__andreyFitInstallPrompt
    if(prompt){
      await prompt.prompt()
      const choice=await prompt.userChoice
      if(choice.outcome==='accepted'){
        delete (window as InstallWindow).__andreyFitInstallPrompt
        setInstallAvailable(false)
      }
      return
    }

    if(!window.isSecureContext){
      setMessage('Установка заблокирована: страница открыта не в безопасном HTTPS-контексте.')
      return
    }
    if(diag.manifest==='bad'){
      setMessage('Браузер не принимает PWA-манифест. Пришли мне скрин этого блока — там уже будет понятна причина.')
      return
    }
    if(diag.serviceWorker==='bad'){
      setMessage('Service Worker ещё не готов. Обнови страницу один раз и повтори проверку.')
      return
    }
    if(!diag.controlled){
      setMessage('Service Worker установлен, но ещё не управляет этой вкладкой. Обнови страницу один раз.')
      return
    }

    setMessage(waited
      ? 'Технические проверки пройдены, но браузер не выдал системное разрешение на установку. Открой fit.andreway.ru именно в полной вкладке Chrome (не во встроенном окне с крестиком X сверху) и попробуй снова.'
      : 'Технические проверки пройдены. Chrome может выдать установку только после взаимодействия со страницей и примерно 30 секунд использования. Останься на сайте, нажми что-нибудь и повтори через полминуты.')
  }

  const mark=(state:CheckState)=>state==='ok'?'✅':state==='bad'?'❌':'…'

  return <section className="panel preference-panel">
    <div className="panel-head"><div><span className="eyebrow">Приложение</span><h3>Andrey Fit на телефоне</h3></div><Smartphone size={19}/></div>
    <p className="panel-description">{installed?'Приложение уже запущено как установленное.':'Установи Andrey Fit на главный экран — он будет открываться отдельно от браузера.'}</p>

    {!installed&&<>
      <div className="preference-list">
        <div className="preference-row"><div><strong>{window.isSecureContext?'✅':'❌'} HTTPS</strong><span>Безопасный контекст для установки</span></div></div>
        <div className="preference-row"><div><strong>{mark(diag.manifest)} Манифест</strong><span>{diag.manifestType||'Проверяю manifest.json'}</span></div></div>
        <div className="preference-row"><div><strong>{mark(diag.serviceWorker)} Service Worker</strong><span>{diag.controlled?'Управляет текущей страницей':'Ожидает управления страницей'}</span></div></div>
        <div className="preference-row"><div><strong>{installAvailable?'✅':'⏳'} Разрешение браузера</strong><span>{installAvailable?'Chrome разрешил установку':'Ждём системный install prompt'}</span></div></div>
      </div>
      {message&&<div className="drawer-notice">{message}</div>}
      <div className="profile-save-row">
        <button className="primary-button compact" onClick={()=>void install()}><Download size={17}/>{installAvailable?'Установить приложение':'Проверить установку'}</button>
      </div>
    </>}
  </section>
}
