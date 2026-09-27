import { useState } from 'react'
import { Activity, ArrowRight, ShieldCheck } from 'lucide-react'
import { hasSupabaseConfig, supabase } from '../lib/supabase'
import type { UserRole } from '../lib/types'

type Props = { onPreview: (role: UserRole) => void; onAuthenticated: () => void }

export function LoginPage({ onPreview, onAuthenticated }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function login(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setLoading(true); setError('')
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (authError) setError('Не удалось войти. Проверь почту и пароль.')
    else onAuthenticated()
  }

  return (
    <div className="login-page">
      <div className="login-visual">
        <div className="login-brand"><div className="brand-mark large"><Activity size={26}/></div><span>Andrey Fitness</span></div>
        <div className="login-copy"><span className="kicker">Персональное сопровождение</span><h1>План, который меняется вместе с тобой.</h1><p>Питание, тренировки и прогресс в одном спокойном интерфейсе — без лишних таблиц и хаоса.</p></div>
        <div className="secure-note"><ShieldCheck size={20}/><span>Доступ к данным ограничивается на уровне базы через Supabase RLS.</span></div>
      </div>
      <div className="login-panel">
        <div className="login-form-wrap">
          <h2>Войти</h2><p className="muted">Используй аккаунт, который создал тренер.</p>
          {hasSupabaseConfig ? (
            <form onSubmit={login} className="login-form">
              <label>Email<input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="name@example.com" required/></label>
              <label>Пароль<input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="••••••••" required/></label>
              {error && <div className="form-error">{error}</div>}
              <button className="primary-button" disabled={loading}>{loading ? 'Входим…' : 'Войти'}<ArrowRight size={18}/></button>
            </form>
          ) : <div className="config-note">Supabase ещё не настроен локально. Интерфейс можно открыть в режиме предпросмотра.</div>}
          <div className="preview-actions">
            <span>Пока база настраивается:</span>
            <button onClick={()=>onPreview('client')}>Посмотреть как клиент</button>
            <button onClick={()=>onPreview('trainer')}>Посмотреть как тренер</button>
          </div>
        </div>
      </div>
    </div>
  )
}
