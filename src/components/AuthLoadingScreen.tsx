import { Activity } from 'lucide-react'

type Props={
  title:string
  subtitle?:string
}

export function AuthLoadingScreen({title,subtitle}:Props){
  return <div className="auth-loading-screen" role="status" aria-live="polite">
    <div className="auth-loading-card">
      <div className="auth-loading-brand">
        <div className="brand-mark large"><Activity size={24}/></div>
        <strong>Andrey-Fit</strong>
      </div>
      <div className="auth-loading-spinner" aria-hidden="true"/>
      <div className="auth-loading-copy">
        <strong>{title}</strong>
        {subtitle&&<span>{subtitle}</span>}
      </div>
    </div>
  </div>
}
