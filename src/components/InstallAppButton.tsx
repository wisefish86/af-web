import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{outcome:'accepted'|'dismissed';platform:string}>
}
type InstallWindow = Window & { __andreyFitInstallPrompt?: Event }

export function InstallAppButton(){
  const getPrompt=()=>((window as InstallWindow).__andreyFitInstallPrompt as InstallPromptEvent|undefined)??null
  const [prompt,setPrompt]=useState<InstallPromptEvent|null>(()=>getPrompt())
  const [installed,setInstalled]=useState(false)
  const [installing,setInstalling]=useState(false)

  useEffect(()=>{
    const standalone=window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as Navigator & {standalone?:boolean}).standalone===true
    setInstalled(standalone)
    const onAvailable=()=>setPrompt(getPrompt())
    const onInstalled=()=>{setInstalled(true);setPrompt(null)}
    const onConsumed=()=>setPrompt(null)
    window.addEventListener('andrey-fit-install-available',onAvailable)
    window.addEventListener('andrey-fit-app-installed',onInstalled)
    window.addEventListener('andrey-fit-install-consumed',onConsumed)
    return ()=>{
      window.removeEventListener('andrey-fit-install-available',onAvailable)
      window.removeEventListener('andrey-fit-app-installed',onInstalled)
      window.removeEventListener('andrey-fit-install-consumed',onConsumed)
    }
  },[])

  if(installed||!prompt)return null

  async function install(){
    if(!prompt||installing)return
    setInstalling(true)
    try{
      await prompt.prompt()
      await prompt.userChoice
    }catch{}
    finally{
      delete (window as InstallWindow).__andreyFitInstallPrompt
      setPrompt(null)
      setInstalling(false)
      window.dispatchEvent(new Event('andrey-fit-install-consumed'))
    }
  }

  return <button className="nav-button install-app-button" disabled={installing} onClick={()=>void install()}>
    <Download size={19}/>{installing?'Открываю…':'Установить приложение'}
  </button>
}
