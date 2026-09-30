import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useBlocker } from 'react-router-dom'

type Props={
  when:boolean
  title?:string
  message?:string
}

export function UnsavedChangesGuard({
  when,
  title='Есть несохранённые изменения',
  message='Если уйти со страницы сейчас, последние изменения будут потеряны.',
}:Props){
  const blocker=useBlocker(when)

  useEffect(()=>{
    if(!when)return
    const onBeforeUnload=(event:BeforeUnloadEvent)=>{
      event.preventDefault()
      event.returnValue=''
    }
    window.addEventListener('beforeunload',onBeforeUnload)
    return ()=>window.removeEventListener('beforeunload',onBeforeUnload)
  },[when])

  if(blocker.state!=='blocked')return null

  return <div className="drawer-backdrop">
    <aside className="exercise-drawer workout-sheet finish-workout-sheet">
      <div className="drawer-head">
        <div><span className="eyebrow">Несохранённые данные</span><h3>{title}</h3></div>
      </div>
      <div className="drawer-body">
        <div className="finish-workout-icon"><AlertTriangle size={24}/></div>
        <p className="sheet-description">{message}</p>
        <div className="finish-workout-actions">
          <button className="ghost-button" onClick={()=>blocker.reset()}>Остаться</button>
          <button className="primary-button" onClick={()=>blocker.proceed()}>Уйти без сохранения</button>
        </div>
      </div>
    </aside>
  </div>
}
