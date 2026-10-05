import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { currentPwaVariant, detectInstalledPwa, isStandalonePwa, markPwaInstalled, wasPwaInstalled, type PwaVariant } from '../lib/pwaInstall'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{outcome:'accepted'|'dismissed';platform:string}>
}
type InstallWindow = Window & {
  __andreyFitInstallPrompt?: InstallPromptEvent
  __andreyFitInstallVariant?: PwaVariant
}

type Props={variant:PwaVariant}

export function InstallAppButton({variant}:Props){
  const getPrompt=()=>{
    const target=window as InstallWindow
    return target.__andreyFitInstallVariant===variant
      ? target.__andreyFitInstallPrompt??null
      : null
  }
  const [prompt,setPrompt]=useState<InstallPromptEvent|null>(()=>getPrompt())
  const [installed,setInstalled]=useState(()=>isStandalonePwa()||wasPwaInstalled(variant))
  const [installing,setInstalling]=useState(false)

  useEffect(()=>{
    let cancelled=false
    if(currentPwaVariant()!==variant){
      setPrompt(null)
      return
    }

    void detectInstalledPwa(variant).then(value=>{
      if(cancelled)return
      setInstalled(value)
      if(value)setPrompt(null)
      else setPrompt(getPrompt())
    })

    const onAvailable=()=>{
      if(cancelled||wasPwaInstalled(variant))return
      setPrompt(getPrompt())
    }
    const onInstalled=(event:Event)=>{
      const installedVariant=(event as CustomEvent<{variant?:PwaVariant}>).detail?.variant
      if(installedVariant&&installedVariant!==variant)return
      markPwaInstalled(variant)
      setInstalled(true)
      setPrompt(null)
    }
    const onConsumed=()=>setPrompt(null)
    window.addEventListener('andrey-fit-install-available',onAvailable)
    window.addEventListener('andrey-fit-app-installed',onInstalled)
    window.addEventListener('andrey-fit-install-consumed',onConsumed)
    return ()=>{
      cancelled=true
      window.removeEventListener('andrey-fit-install-available',onAvailable)
      window.removeEventListener('andrey-fit-app-installed',onInstalled)
      window.removeEventListener('andrey-fit-install-consumed',onConsumed)
    }
  },[variant])

  if(currentPwaVariant()!==variant||installed||!prompt)return null

  async function install(){
    if(!prompt||installing)return
    setInstalling(true)
    try{
      await prompt.prompt()
      const result=await prompt.userChoice
      if(result.outcome==='accepted'){
        markPwaInstalled(variant)
        setInstalled(true)
      }
    }catch{}
    finally{
      const target=window as InstallWindow
      delete target.__andreyFitInstallPrompt
      delete target.__andreyFitInstallVariant
      setPrompt(null)
      setInstalling(false)
      window.dispatchEvent(new Event('andrey-fit-install-consumed'))
    }
  }

  return <button className="nav-button install-app-button" disabled={installing} onClick={()=>void install()}>
    <Download size={19}/>{installing?'Открываю…':'Установить приложение'}
  </button>
}
