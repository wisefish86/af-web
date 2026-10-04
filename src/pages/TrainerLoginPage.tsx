import { useState } from 'react'
import { Activity, ArrowRight, ShieldCheck } from 'lucide-react'
import { hasSupabaseConfig, supabase } from '../lib/supabase'
import { getAppBaseUrl } from '../lib/appUrl'

async function withTimeout<T>(promise:PromiseLike<T>,ms=12000):Promise<T>{
  let timer:number|undefined
  try{
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((_,reject)=>{timer=window.setTimeout(()=>reject(new Error('timeout')),ms)}),
    ])
  }finally{
    if(timer!==undefined)window.clearTimeout(timer)
  }
}

export function TrainerLoginPage(){
  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  const [loading,setLoading]=useState(false)

  async function login(e:React.FormEvent){
    e.preventDefault()
    if(!supabase)return
    setLoading(true);setError('');setMessage('')
    try{
      const {data,error:authError}=await withTimeout(
        supabase.auth.signInWithPassword({email:email.trim().toLowerCase(),password}),
      )
      if(authError||!data.user){
        setError('Не удалось войти. Проверь email и пароль.')
        return
      }

      const {data:profile,error:profileError}=await withTimeout(
        supabase.from('profiles').select('role').eq('id',data.user.id).maybeSingle(),
      )
      if(profileError||profile?.role!=='trainer'){
        await supabase.auth.signOut().catch(()=>undefined)
        setError('Этот аккаунт не имеет доступа к кабинету тренера.')
        return
      }

      window.location.hash='#/'
    }catch{
      setError('Сервер входа не отвечает. Проверь интернет-соединение и попробуй ещё раз.')
    }finally{
      setLoading(false)
    }
  }

  async function resetPassword(){
    if(!supabase)return
    const normalized=email.trim().toLowerCase()
    if(!normalized||!normalized.includes('@')){
      setError('Сначала укажи email тренера.')
      return
    }
    setLoading(true);setError('');setMessage('')
    try{
      const {error:resetError}=await supabase.auth.resetPasswordForEmail(normalized,{
        redirectTo:getAppBaseUrl()+'?reset=1#/trainer-access',
      })
      if(resetError)throw resetError
      setMessage('Ссылка для смены пароля отправлена на почту.')
    }catch{
      setError('Не удалось отправить ссылку для смены пароля.')
    }finally{
      setLoading(false)
    }
  }

  return <div className="login-page">
    <div className="login-visual">
      <div className="login-brand"><div className="brand-mark large"><Activity size={26}/></div><span>Andrey-Fit</span></div>
      <div className="login-copy"><span className="kicker">Кабинет тренера</span><h1>Рабочее пространство Andrey-Fit.</h1><p>Клиенты, программы, питание, прогресс и сообщения — в одном кабинете.</p></div>
      <div className="secure-note"><ShieldCheck size={20}/><span>Доступ разрешён только аккаунту с ролью тренера.</span></div>
    </div>
    <div className="login-panel">
      <div className="login-form-wrap">
        <h2>Вход тренера</h2>
        <p className="muted">Используй email и пароль тренерского аккаунта.</p>
        {hasSupabaseConfig&&<form onSubmit={login} className="login-form">
          <label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value.replace(/\s/g,''))} placeholder="trainer@example.com" required autoCapitalize="none" autoCorrect="off" autoComplete="username"/></label>
          <label>Пароль<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required autoComplete="current-password"/></label>
          <button type="button" className="forgot-password-button" disabled={loading} onClick={()=>void resetPassword()}>Не помню пароль</button>
          {error&&<div className="form-error">{error}</div>}
          {message&&<div className="form-success">{message}</div>}
          <button className="primary-button" disabled={loading}>{loading?'Входим…':'Войти в кабинет'}<ArrowRight size={18}/></button>
        </form>}
      </div>
    </div>
  </div>
}
