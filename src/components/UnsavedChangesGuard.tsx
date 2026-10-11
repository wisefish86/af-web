import { useEffect, useRef, useState } from 'react'

type Props={
  when:boolean
  title?:string
  message?:string
  onSave?:()=>Promise<boolean|void>|boolean|void
  saving?:boolean
}

function internalHref(anchor:HTMLAnchorElement){
  if(anchor.target&&anchor.target!=='_self')return null
  if(anchor.hasAttribute('download'))return null
  const raw=anchor.getAttribute('href')
  if(!raw||raw.startsWith('mailto:')||raw.startsWith('tel:')||raw.startsWith('javascript:'))return null
  if(raw.startsWith('#/'))return raw
  try{
    const url=new URL(anchor.href,window.location.href)
    if(url.origin!==window.location.origin)return null
    if(url.hash.startsWith('#/'))return url.hash
  }catch{}
  return null
}

/**
 * Shared safety net for dirty editors.
 * - browser refresh/tab close uses the native beforeunload warning;
 * - in-app HashRouter links use the branded drawer below;
 * - editors may provide onSave to support "save and continue".
 */
export function UnsavedChangesGuard({
  when,
  title='Есть несохранённые изменения',
  message='Если уйти сейчас, внесённые изменения не сохранятся.',
  onSave,
  saving=false,
}:Props){
  const [pendingHref,setPendingHref]=useState<string|null>(null)
  const [savingHere,setSavingHere]=useState(false)
  const bypassRef=useRef(false)

  useEffect(()=>{
    if(!when)return
    const onBeforeUnload=(event:BeforeUnloadEvent)=>{
      if(bypassRef.current)return
      event.preventDefault()
      event.returnValue=''
    }
    window.addEventListener('beforeunload',onBeforeUnload)
    return ()=>window.removeEventListener('beforeunload',onBeforeUnload)
  },[when])

  useEffect(()=>{
    if(!when)return
    const onClick=(event:MouseEvent)=>{
      if(bypassRef.current||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return
      const target=event.target
      if(!(target instanceof Element))return
      const anchor=target.closest('a[href]') as HTMLAnchorElement|null
      if(!anchor)return
      const href=internalHref(anchor)
      if(!href)return
      event.preventDefault()
      event.stopPropagation()
      setPendingHref(href)
    }
    document.addEventListener('click',onClick,true)
    return ()=>document.removeEventListener('click',onClick,true)
  },[when])

  useEffect(()=>{
    if(!when)setPendingHref(null)
  },[when])

  function leave(){
    if(!pendingHref)return
    bypassRef.current=true
    window.location.hash=pendingHref.startsWith('#')?pendingHref.slice(1):pendingHref
  }

  async function saveAndLeave(){
    if(!onSave||savingHere||saving)return
    setSavingHere(true)
    try{
      const result=await onSave()
      if(result===false)return
      leave()
    }finally{
      setSavingHere(false)
    }
  }

  if(!pendingHref)return null

  const busy=saving||savingHere
  return <div className="drawer-backdrop unsaved-navigation-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setPendingHref(null)}}>
    <aside className="exercise-drawer workout-sheet unsaved-navigation-sheet" role="dialog" aria-modal="true" aria-labelledby="unsaved-navigation-title">
      <div className="drawer-head">
        <div><span className="eyebrow">Несохранённые данные</span><h3 id="unsaved-navigation-title">{title}</h3></div>
      </div>
      <div className="drawer-body">
        <p className="sheet-description">{message}</p>
        <div className="finish-workout-actions">
          <button className="ghost-button" disabled={busy} onClick={()=>setPendingHref(null)}>Остаться</button>
          <button className="ghost-button danger-text-button" disabled={busy} onClick={leave}>Уйти без сохранения</button>
          {onSave&&<button className="primary-button" disabled={busy} onClick={()=>void saveAndLeave()}>{busy?'Сохраняю…':'Сохранить и перейти'}</button>}
        </div>
      </div>
    </aside>
  </div>
}
