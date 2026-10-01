import { useEffect } from 'react'

type Props={
  when:boolean
  title?:string
  message?:string
}

/**
 * HashRouter-compatible safety net.
 * In-app editors use their own confirmation drawers for close/cancel actions.
 * This guard protects only browser refresh/tab close; react-router useBlocker
 * cannot be used with the current declarative HashRouter.
 */
export function UnsavedChangesGuard({when}:Props){
  useEffect(()=>{
    if(!when)return
    const onBeforeUnload=(event:BeforeUnloadEvent)=>{
      event.preventDefault()
      event.returnValue=''
    }
    window.addEventListener('beforeunload',onBeforeUnload)
    return ()=>window.removeEventListener('beforeunload',onBeforeUnload)
  },[when])

  return null
}
