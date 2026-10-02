import { useEffect, useMemo, useState } from 'react'
import { Activity, ArrowRight, Mail, Send, ShieldCheck, X } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { hasSupabaseConfig, supabase } from '../lib/supabase'
import { getAppBaseUrl } from '../lib/appUrl'
import type { UserRole } from '../lib/types'
import { loadAccessHelp, type AccessHelp } from '../features/access/service'

type Props = { onPreview: (role: UserRole) => void; onAuthenticated: () => void }
type AuthMode='login'|'trainer'

export function LoginPage({ onPreview, onAuthenticated }: Props) {
  const location=useLocation()
  const legacyInviteFromUrl=useMemo(()=>{
    const routeInvite=new URLSearchParams(location.search).get('invite')
    const pageInvite=new URLSearchParams(window.location.search).get('invite')
    return routeInvite??pageInvite??''
  },[location.search])
  const bootstrapFromUrl=useMemo(()=>{
    const routeBootstrap=new URLSearchParams(location.search).get('bootstrap')
    const pageBootstrap=new URLSearchParams(window.location.search).get('bootstrap')
    const hashBootstrap=new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('bootstrap')
    return routeBootstrap==='1'||pageBootstrap==='1'||hashBootstrap==='1'
  },[location.search])
  const [mode,setMode]=useState<AuthMode>(bootstrapFromUrl?'trainer':'login')
  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')
  const [displayName,setDisplayName]=useState('')
  const [bootstrapAvailable,setBootstrapAvailable]=useState(false)
  const [message,setMessage]=useState('')
  const [error,setError]=useState('')
  const [loading,setLoading]=useState(false)
  const [accessHelp,setAccessHelp]=useState<AccessHelp|null>(null)
  const [accessHelpLoading,setAccessHelpLoading]=useState(false)

  useEffect(()=>{
    if(!supabase)return
    supabase.rpc('trainer_bootstrap_available').then(({data})=>setBootstrapAvailable(Boolean(data)))
  },[])

  async function login(e:React.FormEvent){
    e.preventDefault()
    if(!supabase)return
    const credential=email.trim().toLowerCase()
    const authEmail=credential.includes('@')?credential:(credential+'@users.andreway.ru')
    setLoading(true);setError('');setMessage('')
    const {error:authError}=await supabase.auth.signInWithPassword({email:authEmail,password})
    setLoading(false)
    if(authError)setError('Не удалось войти. Проверь логин и пароль.')
    else onAuthenticated()
  }

  async function resetPassword(){
    if(!supabase)return
    const credential=email.trim()
    if(!credential){setError('Сначала укажи логин.');return}
    setError('');setMessage('')

    if(credential.includes('@')){
      setLoading(true)
      const base=getAppBaseUrl()
      const {error:resetError}=await supabase.auth.resetPasswordForEmail(credential,{
        redirectTo:base+'?reset=1',
      })
      setLoading(false)
      if(resetError){setError(resetError.message);return}
      setMessage('Ссылка для смены пароля отправлена на почту.')
      return
    }

    setAccessHelpLoading(true)
    try{
      const help=await loadAccessHelp(credential)
      if(!help.contacts.length){
        setMessage('Не удалось найти контакты тренера по этому логину. Проверь логин или свяжись с тренером привычным способом.')
        return
      }
      setAccessHelp(help)
    }catch{
      setMessage('Не удалось загрузить контакты тренера. Попробуй ещё раз.')
    }finally{setAccessHelpLoading(false)}
  }

  async function signupTrainer(e:React.FormEvent){
    e.preventDefault()
    if(!supabase)return
    if(!displayName.trim())return setError('Укажи имя.')
    setLoading(true);setError('');setMessage('')
    localStorage.setItem('andrey-fit-pending-trainer-bootstrap','1')
    const base=getAppBaseUrl()
    const {data,error:authError}=await supabase.auth.signUp({
      email:email.trim(),password,
      options:{
        data:{display_name:displayName.trim()},
        emailRedirectTo:base+'?bootstrap=1#/',
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
  }

  return <div className="login-page">
    <div className="login-visual">
      <div className="login-brand"><div className="brand-mark large"><Activity size={26}/></div><span>ANDREWAY Fit</span></div>
      <div className="login-copy"><span className="kicker">Сопровождение с тренером</span><h1>План, который меняется вместе с тобой.</h1><p>Питание, тренировки и прогресс в одном спокойном интерфейсе — без лишних таблиц и хаоса.</p></div>
      <div className="secure-note"><ShieldCheck size={20}/><span>Каждый клиент видит только свои данные, тренер — только назначенных ему клиентов.</span></div>
    </div>

    <div className="login-panel">
      <div className="login-form-wrap">
        {!bootstrapFromUrl&&mode!=='trainer'&&<div className="auth-mode-tabs">
          <button className={mode==='login'?'is-active':''} onClick={()=>switchMode('login')}>Войти</button>
        </div>}

        {mode==='login'&&<>
          <h2>Войти</h2><p className="muted">Введи логин и временный/личный пароль, которые используешь для ANDREWAY Fit.</p>
          {legacyInviteFromUrl&&<div className="invite-detected"><div><strong>Ссылка приглашения устарела</strong><span>Регистрация больше не нужна. Попроси тренера прислать готовый логин и временный пароль.</span></div></div>}
          {hasSupabaseConfig&&<form onSubmit={login} className="login-form">
            <label>Логин<input value={email} onChange={e=>setEmail(e.target.value.replace(/\s/g,''))} placeholder="maria-k7q4" required autoCapitalize="none" autoCorrect="off" autoComplete="username"/></label>
            <label>Пароль<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required autoComplete="current-password"/></label>
            <button type="button" className="forgot-password-button" disabled={loading||accessHelpLoading} onClick={()=>void resetPassword()}>{accessHelpLoading?'Ищу тренера…':'Не помню пароль'}</button>
            {error&&<div className="form-error">{error}</div>}{message&&<div className="form-success">{message}</div>}
            <button className="primary-button" disabled={loading}>{loading?'Входим…':'Войти'}<ArrowRight size={18}/></button>
          </form>}
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



        {accessHelp&&<div className="access-help-card">
          <div className="access-help-head"><div><span className="eyebrow">Восстановление доступа</span><strong>Напиши тренеру</strong></div><button type="button" className="icon-button" onClick={()=>setAccessHelp(null)} aria-label="Закрыть"><X size={15}/></button></div>
          <p>{accessHelp.trainer_name?<>Свяжись с тренером: <strong>{accessHelp.trainer_name}</strong>. </>:null}Укажи свой логин — тренер выдаст новый временный пароль.</p>
          <div className="access-help-links">{accessHelp.contacts.map(item=><a key={item.channel} href={item.url} target="_blank" rel="noreferrer"><Send size={15}/>{item.label||item.channel}</a>)}</div>
        </div>}

        <div className="preview-actions">
          <span>Предпросмотр:</span>
          <button onClick={()=>onPreview('client')}>как клиент</button>
          <button onClick={()=>onPreview('trainer')}>как тренер</button>
        </div>
      </div>
    </div>
  </div>
}
