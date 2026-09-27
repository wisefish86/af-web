import { useState } from 'react'
import { CheckCircle2, KeyRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export function PasswordResetPage(){
  const navigate=useNavigate()
  const [password,setPassword]=useState('')
  const [confirm,setConfirm]=useState('')
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  const [done,setDone]=useState(false)

  async function save(e:React.FormEvent){
    e.preventDefault()
    if(!supabase)return
    if(password.length<8){setError('Пароль должен быть не короче 8 символов.');return}
    if(password!==confirm){setError('Пароли не совпадают.');return}
    setLoading(true);setError('')
    const {error:authError}=await supabase.auth.updateUser({password})
    setLoading(false)
    if(authError){setError(authError.message);return}
    setDone(true)
  }

  return <div className="page-stack password-reset-page">
    <section className="panel password-reset-card">
      <div className="password-reset-icon">{done?<CheckCircle2 size={24}/>:<KeyRound size={24}/>}</div>
      {done?<>
        <h2>Пароль изменён</h2>
        <p>Теперь можно продолжить работу в Andrey Fit.</p>
        <button className="primary-button" onClick={()=>navigate('/')}>Перейти в кабинет</button>
      </>:<>
        <h2>Новый пароль</h2>
        <p>Придумай новый пароль. Старый пароль ни тренер, ни приложение увидеть не могут.</p>
        <form className="login-form" onSubmit={save}>
          <label>Новый пароль<input type="password" minLength={8} value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password" required/></label>
          <label>Повтори пароль<input type="password" minLength={8} value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="new-password" required/></label>
          {error&&<div className="form-error">{error}</div>}
          <button className="primary-button" disabled={loading}>{loading?'Сохраняю…':'Сохранить новый пароль'}</button>
        </form>
      </>}
    </section>
  </div>
}
