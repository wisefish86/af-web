import { useEffect, useState } from 'react'
import { CheckCircle2, KeyRound, LogOut, ShieldCheck, UserRound } from 'lucide-react'
import { completeClientFirstAccess } from '../features/access/service'
import { loadMyProfile } from '../features/profile/service'

type Props={initialName:string;onCompleted:(name:string)=>void;onLogout:()=>void}

export function FirstAccessSetupPage({initialName,onCompleted,onLogout}:Props){
  const [name,setName]=useState(initialName==='Новый клиент'?'':initialName)
  const [nickname,setNickname]=useState('')
  const [age,setAge]=useState('')
  const [password,setPassword]=useState('')
  const [confirm,setConfirm]=useState('')
  const [passwordRequired,setPasswordRequired]=useState(false)
  const [profileReady,setProfileReady]=useState(false)
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')

  useEffect(()=>{
    let cancelled=false
    void loadMyProfile()
      .then(profile=>{
        if(cancelled)return
        if(profile.display_name&&profile.display_name!=='Новый клиент')setName(profile.display_name)
        setNickname(profile.nickname??'')
        setAge(profile.age==null?'':String(profile.age))
        setPasswordRequired(Boolean(profile.login_alias))
        setProfileReady(true)
      })
      .catch(()=>{
        if(!cancelled)setError('Не удалось загрузить профиль. Обнови страницу и попробуй ещё раз.')
      })
    return()=>{cancelled=true}
  },[])

  async function submit(e:React.FormEvent){
    e.preventDefault()
    if(saving||!profileReady)return
    if(!name.trim()){setError('Укажи, как к тебе обращаться.');return}
    const ageValue=age.trim()===''?null:Number(age)
    if(ageValue!=null&&(!Number.isInteger(ageValue)||ageValue<13||ageValue>100)){setError('Возраст должен быть от 13 до 100 лет.');return}
    if(passwordRequired&&password.length<8){setError('Пароль должен быть не короче 8 символов.');return}
    if(passwordRequired&&password!==confirm){setError('Пароли не совпадают.');return}

    setSaving(true);setError('')
    try{
      const savedName=await completeClientFirstAccess({
        displayName:name,
        nickname,
        age:ageValue,
        password:passwordRequired?password:undefined,
      })
      onCompleted(savedName)
    }catch(e){setError(e instanceof Error?e.message:'Не удалось завершить настройку')}
    finally{setSaving(false)}
  }

  return <div className="first-access-page">
    <div className="first-access-card">
      <div className="first-access-brand"><div className="brand-mark large"><ShieldCheck size={25}/></div><div><strong>Andrey-Fit</strong><span>Первый вход</span></div></div>
      <div className="first-access-copy">
        <span className="eyebrow">Один раз</span>
        <h1>Расскажи немного о себе</h1>
        <p>{passwordRequired?'Заполни профиль и установи свой пароль.':'Telegram уже подключён. Осталось только заполнить короткий профиль.'}</p>
      </div>

      <form className="first-access-form" onSubmit={submit}>
        <label><span><UserRound size={15}/>Как к тебе обращаться</span><input value={name} onChange={e=>setName(e.target.value)} maxLength={60} autoFocus placeholder="Например, Маша"/></label>

        <label><span>Метка <small>необязательно</small></span><input value={nickname} onChange={e=>setNickname(e.target.value)} maxLength={40} placeholder="Например, Маша"/></label>

        <label><span>Возраст <small>необязательно</small></span><input type="number" min="13" max="100" inputMode="numeric" value={age} onChange={e=>setAge(e.target.value)} placeholder="32"/></label>

        {passwordRequired&&<>
          <label><span><KeyRound size={15}/>Новый пароль</span><input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={8} autoComplete="new-password" placeholder="Минимум 8 символов"/></label>
          <label><span><CheckCircle2 size={15}/>Повтори пароль</span><input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} minLength={8} autoComplete="new-password" placeholder="Ещё раз"/></label>
        </>}

        {!profileReady&&!error&&<div className="form-success">Загружаю профиль…</div>}
        {error&&<div className="form-error">{error}</div>}
        <button className="primary-button" disabled={saving||!profileReady}>{saving?'Сохраняю…':'Сохранить и войти'}</button>
      </form>

      <button type="button" className="first-access-logout" disabled={saving} onClick={onLogout}><LogOut size={15}/>Выйти и настроить позже</button>
    </div>
  </div>
}
