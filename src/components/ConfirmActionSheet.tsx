import { AlertTriangle, X } from 'lucide-react'

type Props={
  open:boolean
  title:string
  message:string
  confirmLabel:string
  cancelLabel?:string
  destructive?:boolean
  busy?:boolean
  eyebrow?:string
  onConfirm:()=>void
  onCancel:()=>void
}

export function ConfirmActionSheet({
  open,title,message,confirmLabel,cancelLabel='Отмена',destructive=false,busy=false,
  eyebrow='Подтверждение',onConfirm,onCancel,
}:Props){
  if(!open)return null
  return <div className="drawer-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onCancel()}}>
    <aside className={`exercise-drawer workout-sheet ${destructive?'destructive-sheet':''}`} role="dialog" aria-modal="true" aria-labelledby="confirm-action-title">
      <div className="drawer-head">
        <div><span className="eyebrow">{eyebrow}</span><h3 id="confirm-action-title">{title}</h3></div>
        <button className="icon-button" aria-label="Закрыть" disabled={busy} onClick={onCancel}><X size={18}/></button>
      </div>
      <div className="drawer-body">
        <div className="confirm-action-copy">
          {destructive&&<AlertTriangle size={18} aria-hidden="true"/>}
          <p className="sheet-description">{message}</p>
        </div>
        <div className="finish-workout-actions">
          <button className="ghost-button" disabled={busy} onClick={onCancel}>{cancelLabel}</button>
          <button className={destructive?'danger-button':'primary-button'} disabled={busy} onClick={onConfirm}>{busy?'Выполняю…':confirmLabel}</button>
        </div>
      </div>
    </aside>
  </div>
}
