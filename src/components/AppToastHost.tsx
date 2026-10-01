import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Info, X } from 'lucide-react'
import type { AppToastKind } from '../lib/toast'

type ToastState={message:string;kind:AppToastKind}|null

export function AppToastHost(){
  const [toast,setToast]=useState<ToastState>(null)
  const timer=useRef<number|null>(null)

  useEffect(()=>{
    const onToast=(event:Event)=>{
      const detail=(event as CustomEvent<{message:string;kind?:AppToastKind}>).detail
      if(!detail?.message)return
      if(timer.current)window.clearTimeout(timer.current)
      setToast({message:detail.message,kind:detail.kind??'success'})
      timer.current=window.setTimeout(()=>setToast(null),4200)
    }
    window.addEventListener('app:toast',onToast)
    return ()=>{
      window.removeEventListener('app:toast',onToast)
      if(timer.current)window.clearTimeout(timer.current)
    }
  },[])

  if(!toast)return null
  const Icon=toast.kind==='success'?CheckCircle2:Info
  return <div className={'app-toast '+toast.kind} role="status">
    <Icon size={18}/>
    <span>{toast.message}</span>
    <button type="button" aria-label="Закрыть" onClick={()=>setToast(null)}><X size={16}/></button>
  </div>
}
