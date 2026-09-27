import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{outcome:'accepted'|'dismissed';platform:string}>
}

export function InstallAppButton(){
  const [prompt,setPrompt]=useState<InstallPromptEvent|null>(null)
  const [installed,setInstalled]=useState(false)

  useEffect(()=>{
    const standalone=window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as Navigator & {standalone?:boolean}).standalone===true
    setInstalled(standalone)
    const onPrompt=(event:Event)=>{
      event.preventDefault()
      setPrompt(event as InstallPromptEvent)
    }
    const onInstalled=()=>{setInstalled(true);setPrompt(null)}
    window.addEventListener('beforeinstallprompt',onPrompt)
    window.addEventListener('appinstalled',onInstalled)
    return ()=>{
      window.removeEventListener('beforeinstallprompt',onPrompt)
      window.removeEventListener('appinstalled',onInstalled)
    }
  },[])

  if(installed||!prompt)return null

  async function install(){
    if(!prompt)return
    await prompt.prompt()
    const choice=await prompt.userChoice
    if(choice.outcome==='accepted')setPrompt(null)
  }

  return <button className="nav-button install-app-button" onClick={()=>void install()}>
    <Download size={19}/>Установить приложение
  </button>
}
