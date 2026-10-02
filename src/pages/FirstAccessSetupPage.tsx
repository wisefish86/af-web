import { useState } from 'react'
import { CheckCircle2, KeyRound, LogOut, ShieldCheck, UserRound } from 'lucide-react'
import { completeClientFirstAccess } from '../features/access/service'

type Props={initialName:string;onCompleted:(name:string)=>void;onLogout:()=>void}

export function FirstAccessSetupPage({initialName,onCompleted,onLogout}:Props){
  const [name,setName]=useState(initialName)
  const [password,setPassword]=useState('')
  const [confirm,setConfirm]=useState('')
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')

  async function submit(e:React.FormEvent){
    e.preventDefault()
    if(saving)return
    if(!name.trim()){setError('Укажи, как к тебе обращаться.');return}
    if(password.length<8){setError('Пароль должен быть не короче 8 символов.');return}
    if(password!==confirm){setError('Пароли не совпадают.');return}
    setSaving(true);setError('')
    try{
      const savedName=await completeClientFirstAccess(name,password)
      onCompleted(savedName)
    }catch(e){setError(e instanceof Error?e.message:'Не удалось завершить настройку доступа')}
    finally{setSaving(false)}
  }

  return <div className="first-access-page">
    <div className="first-access-card">
      <div className="first-access-brand"><div className="brand-mark large"><ShieldCheck size={25}/></div><div><strong>ANDREWAY Fit</strong><span>Первый вход</span></div></div>
      <div className="first-access-copy">
        <span className="eyebrow">Один раз</span>
        <h1>Настрой доступ под себя</h1>
        <p>Тренер прислал временный пароль. Теперь выбери имя, которое будет видеть тренер, и установи свой пароль.</p>
      </div>

      <form className="first-access-form" onSubmit={submit}>
        <label><span><UserRound size={15}/>Как к тебе обращаться</span><input value={name} onChange={e=>setName(e.target.value)} maxLength={60} autoFocus placeholder="Например, Маша"/></label>
        <small className="first-access-help">Имя можно будет поменять позже в Настройках. Тренер увидит новое имя в своём списке клиентов.</small>

        <label><span><KeyRound size={15}/>Новый пароль</span><input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={8} autoComplete="new-password" placeholder="Минимум 8 символов"/></label>
        <label><span><CheckCircle2 size={15}/>Повтори пароль</span><input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} minLength={8} autoComplete="new-password" placeholder="Ещё раз"/></label>
        <small className="first-access-help">После сохранения обычной смены пароля в приложении не будет. Если забудешь его — напиши тренеру, он выдаст новый временный пароль.</small>

        {error&&<div className="form-error">{error}</div>}
        <button className="primary-button" disabled={saving}>{saving?'Сохраняю…':'Сохранить и войти'}</button>
      </form>

      <button type="button" className="first-access-logout" disabled={saving} onClick={onLogout}><LogOut size={15}/>Выйти и настроить позже</button>
    </div>
  </div>
}
