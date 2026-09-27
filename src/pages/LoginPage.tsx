import { useEffect, useMemo, useState } from 'react'
import { Activity, ArrowRight, Mail, ShieldCheck, UserPlus } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { hasSupabaseConfig, supabase } from '../lib/supabase'
import type { UserRole } from '../lib/types'

type Props = { onPreview: (role: UserRole) => void; onAuthenticated: () => void }
type AuthMode='login'|'join'|'trainer'

export function LoginPage({ onPreview, onAuthenticated }: Props) {
  const location=useLocation()
  const inviteFromUrl=useMemo(()=>new URLSearchParams(location.search).get('invite')??'',[location.search])
  const [mode,setMode]=useState<AuthMode>(inviteFromUrl?'join':'login')
  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')
  const [displayName,setDisplayName]=useState('')
  const [nickname,setNickname]=useState('')
  const [invite,setInvite]=useState(inviteFromUrl)
  const [bootstrapAvailable,setBootstrapAvailable]=useState(false)
  const [message,setMessage]=useState('')
  const [error,setError]=useState('')
  const [loading,setLoading]=useState(false)

  useEffect(()=>{
    if(!supabase)return
    supabase.rpc('trainer_bootstrap_available').then(({data})=>setBootstrapAvailable(Boolean(data)))
  },[])

  async function login(e:React.FormEvent){
    e.preventDefault()
    if(!supabase)return
    setLoading(true);setError('');setMessage('')
    const {error:authError}=await supabase.auth.signInWithPassword({email:email.trim(),password})
    setLoading(false)
    if(authError)setError('Не удалось войти. Проверь почту и пароль.')
    else onAuthenticated()
  }

  async function signupClient(e:React.FormEvent){
    e.preventDefault()
    if(!supabase)return
    if(!invite.trim())return setError('Нужно приглашение тренера.')
    if(!displayName.trim())return setError('Укажи имя.')
    setLoading(true);setError('');setMessage('')
    localStorage.setItem('andrey-fit-pending-client-invite',invite.trim())
    const base=window.location.origin+window.location.pathname
    const {data,error:authError}=await supabase.auth.signUp({
      email:email.trim(),password,
      options:{
        data:{display_name:displayName.trim(),nickname:nickname.trim()||null},
        emailRedirectTo:base+'?invite='+encodeURIComponent(invite.trim()),
      },
    })
    setLoading(false)
    if(authError){
      localStorage.removeItem('andrey-fit-pending-client-invite')
      setError(authError.message.includes('registered')?'Аккаунт с такой почтой уже существует. Войди и открой ссылку-приглашение ещё раз.':authError.message)
      return
    }
    if(data.session)onAuthenticated()
    else setMessage('Проверь почту и подтверди регистрацию. После подтверждения приглашение привяжется автоматически.')
  }

  async function signupTrainer(e:React.FormEvent){
    e.preventDefault()
    if(!supabase)return
    if(!displayName.trim())return setError('Укажи имя.')
    setLoading(true);setError('');setMessage('')
    localStorage.setItem('andrey-fit-pending-trainer-bootstrap','1')
    const base=window.location.origin+window.location.pathname
    const {data,error:authError}=await supabase.auth.signUp({
      email:email.trim(),password,
      options:{
        data:{display_name:displayName.trim()},
        emailRedirectTo:base+'?bootstrap=1',
      },
    })
    setLoading(false)
    if(authError){
      localStorage.removeItem('andrey-fit-pending-trainer-bootstrap')
      setError(authError.message)
      return
    }
    if(data.session)onAuthenticated()
    else setMessage('Проверь почту и подтверди регистрацию. Этот первый аккаунт станет аккаунтом тренера.')
  }

  function switchMode(next:AuthMode){
    setMode(next);setError('');setMessage('')
    if(next!=='join')setInvite('')
    else if(inviteFromUrl)setInvite(inviteFromUrl)
  }

  return <div className="login-page">
    <div className="login-visual">
      <div className="login-brand"><div className="brand-mark large"><Activity size={26}/></div><span>Andrey Fitness</span></div>
      <div className="login-copy"><span className="kicker">Персональное сопровождение</span><h1>План, который меняется вместе с тобой.</h1><p>Питание, тренировки и прогресс в одном спокойном интерфейсе — без лишних таблиц и хаоса.</p></div>
      <div className="secure-note"><ShieldCheck size={20}/><span>Каждый клиент видит только свои данные, тренер — только назначенных ему клиентов.</span></div>
    </div>

    <div className="login-panel">
      <div className="login-form-wrap">
        <div className="auth-mode-tabs">
          <button className={mode==='login'?'is-active':''} onClick={()=>switchMode('login')}>Войти</button>
          <button className={mode==='join'?'is-active':''} onClick={()=>switchMode('join')}>По приглашению</button>
        </div>

        {mode==='login'&&<>
          <h2>Войти</h2><p className="muted">Почта используется только для входа и восстановления доступа.</p>
          {hasSupabaseConfig&&<form onSubmit={login} className="login-form">
            <label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com" required autoComplete="email"/></label>
            <label>Пароль<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required autoComplete="current-password"/></label>
            {error&&<div className="form-error">{error}</div>}{message&&<div className="form-success">{message}</div>}
            <button className="primary-button" disabled={loading}>{loading?'Входим…':'Войти'}<ArrowRight size={18}/></button>
          </form>}
        </>}

        {mode==='join'&&<>
          <h2>Создать аккаунт клиента</h2><p className="muted">Регистрация доступна по одноразовому приглашению тренера.</p>
          <form onSubmit={signupClient} className="login-form">
            <label>Имя<input value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="Как к тебе обращаться" required maxLength={60}/></label>
            <label>Никнейм / метка <small>необязательно</small><input value={nickname} onChange={e=>setNickname(e.target.value)} placeholder="Например: Музыкант" maxLength={40}/></label>
            <label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email"/></label>
            <label>Пароль<input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={8} required autoComplete="new-password"/></label>
            <label>Код приглашения<input value={invite} onChange={e=>setInvite(e.target.value)} required/></label>
            {error&&<div className="form-error">{error}</div>}{message&&<div className="form-success">{message}</div>}
            <button className="primary-button" disabled={loading}><UserPlus size={17}/>{loading?'Создаём…':'Создать аккаунт'}</button>
          </form>
        </>}

        {mode==='trainer'&&<>
          <h2>Первый аккаунт тренера</h2><p className="muted">Этот режим доступен только пока в системе ещё нет тренера.</p>
          <form onSubmit={signupTrainer} className="login-form">
            <label>Имя<input value={displayName} onChange={e=>setDisplayName(e.target.value)} required maxLength={60}/></label>
            <label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email"/></label>
            <label>Пароль<input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={8} required autoComplete="new-password"/></label>
            {error&&<div className="form-error">{error}</div>}{message&&<div className="form-success">{message}</div>}
            <button className="primary-button" disabled={loading}><Mail size={17}/>{loading?'Создаём…':'Создать аккаунт тренера'}</button>
          </form>
        </>}

        {mode!=='trainer'&&bootstrapAvailable&&<button className="trainer-bootstrap-link" onClick={()=>switchMode('trainer')}>Я тренер · создать первый аккаунт</button>}

        <div className="preview-actions">
          <span>Предпросмотр:</span>
          <button onClick={()=>onPreview('client')}>как клиент</button>
          <button onClick={()=>onPreview('trainer')}>как тренер</button>
        </div>
      </div>
    </div>
  </div>
}
