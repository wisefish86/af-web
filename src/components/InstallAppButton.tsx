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

  useEffect(()=>{
    const standalone=window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as Navigator & {standalone?:boolean}).standalone===true
    setInstalled(standalone)
    const onAvailable=()=>setPrompt(getPrompt())
    const onInstalled=()=>{setInstalled(true);setPrompt(null)}
    window.addEventListener('andrey-fit-install-available',onAvailable)
    window.addEventListener('andrey-fit-app-installed',onInstalled)
    return ()=>{
      window.removeEventListener('andrey-fit-install-available',onAvailable)
      window.removeEventListener('andrey-fit-app-installed',onInstalled)
    }
  },[])

  if(installed||!prompt)return null

  async function install(){
    if(!prompt)return
    await prompt.prompt()
    const choice=await prompt.userChoice
    if(choice.outcome==='accepted'){
      delete (window as InstallWindow).__andreyFitInstallPrompt
      setPrompt(null)
    }
  }

  return <button className="nav-button install-app-button" onClick={()=>void install()}>
    <Download size={19}/>Установить приложение
  </button>
}
