import { useEffect, useMemo, useState } from 'react'
import { Bell, Check, Eye, EyeOff, ShieldCheck, UserRound } from 'lucide-react'
import { ToggleSwitch } from '../components/ToggleSwitch'
import { trackingGroups } from '../data/platformDemo'
import { loadMyProfile, saveMyProfile } from '../features/profile/service'
import { neutralAvatars, type ClientProfile } from '../features/profile/types'

const STORAGE_KEY = 'andrey-fitness-preview-preferences'
type Preferences = Record<string, boolean>
type Props={preview:boolean}

const previewProfile:ClientProfile={
  id:'preview',display_name:'Сергей',login_alias:'sergey-musician',nickname:'Музыкант',
  age:37,city:null,timezone:'Europe/Moscow',avatar_key:'fox'
}

export function SettingsPage({preview}:Props) {
  const optionalFields = useMemo(
    () => trackingGroups.flatMap(group => group.items).filter(item => item.enabled && item.clientCanHide && !item.required),
    [],
  )
  const [visible, setVisible] = useState<Preferences>(() => {
    try { const raw=localStorage.getItem(STORAGE_KEY); if(raw)return JSON.parse(raw) } catch {}
    return Object.fromEntries(optionalFields.map(item => [item.code,true]))
  })
  const [profile,setProfile]=useState<ClientProfile>(previewProfile)
  const [profileLoading,setProfileLoading]=useState(!preview)
  const [profileSaving,setProfileSaving]=useState(false)
  const [profileNotice,setProfileNotice]=useState('')
  const [notifications,setNotifications]=useState({weight:true,waist:true,workout:true})

  useEffect(()=>{ localStorage.setItem(STORAGE_KEY,JSON.stringify(visible)) },[visible])

  useEffect(()=>{
    if(preview){setProfileLoading(false);return}
    loadMyProfile()
      .then(setProfile)
      .catch(e=>setProfileNotice(e instanceof Error?e.message:'Не удалось загрузить профиль'))
      .finally(()=>setProfileLoading(false))
  },[preview])

  async function saveProfile(){
    if(!profile.display_name.trim()){setProfileNotice('Укажи имя.');return}
    setProfileSaving(true);setProfileNotice('')
    try{
      if(!preview) await saveMyProfile(profile)
      setProfileNotice('Профиль сохранён.')
    }catch(e){setProfileNotice(e instanceof Error?e.message:'Не удалось сохранить профиль')}
    finally{setProfileSaving(false)}
  }

  return <div className="page-stack settings-page">
    <section className="section-intro settings-hero">
      <div>
        <span className="eyebrow">Мой кабинет</span>
        <h2>Профиль и настройки</h2>
        <p>Только данные, которые действительно нужны для сопровождения. Личную фотографию загружать не требуется.</p>
      </div>
      <div className="calm-badge"><ShieldCheck size={18}/><span>Минимум личных данных</span></div>
    </section>

    <section className="panel profile-settings-panel">
      <div className="panel-head"><div><span className="eyebrow">Профиль</span><h3>Как тебя показывать в приложении</h3></div><UserRound size={19}/></div>
      {profileLoading ? <div className="library-empty">Загружаю профиль…</div> : <>
        <div className="profile-avatar-picker">
          {neutralAvatars.map(a=><button key={a.key} className={profile.avatar_key===a.key?'is-active':''} onClick={()=>setProfile(p=>({...p,avatar_key:a.key}))} title={a.label}><span>{a.emoji}</span>{profile.avatar_key===a.key&&<Check size={12}/>}</button>)}
        </div>
        <div className="form-grid-3 profile-form-grid">
          <label className="field-label">Имя / как обращаться<input value={profile.display_name} maxLength={60} onChange={e=>setProfile(p=>({...p,display_name:e.target.value}))}/></label>
          <label className="field-label">Никнейм / метка<input value={profile.nickname??''} maxLength={40} onChange={e=>setProfile(p=>({...p,nickname:e.target.value||null}))} placeholder="Например: Музыкант"/></label>
          <label className="field-label">Возраст<input type="number" min="13" max="100" value={profile.age??''} onChange={e=>setProfile(p=>({...p,age:e.target.value===''?null:Number(e.target.value)}))}/></label>
          <label className="field-label">Город <small>необязательно</small><input value={profile.city??''} maxLength={80} onChange={e=>setProfile(p=>({...p,city:e.target.value||null}))} placeholder="Можно не указывать"/></label>
          <label className="field-label">Часовой пояс<select value={profile.timezone} onChange={e=>setProfile(p=>({...p,timezone:e.target.value}))}><option value="Europe/Moscow">Москва (UTC+3)</option><option value="Europe/Kaliningrad">Калининград (UTC+2)</option><option value="Asia/Yekaterinburg">Екатеринбург (UTC+5)</option><option value="Asia/Novosibirsk">Новосибирск (UTC+7)</option><option value="Asia/Vladivostok">Владивосток (UTC+10)</option></select></label>
          {profile.login_alias&&<label className="field-label">Логин<input value={profile.login_alias} disabled/><small>Служебный логин отдельно от имени профиля.</small></label>}
        </div>
        <div className="profile-save-row"><button className="primary-button compact" disabled={profileSaving} onClick={()=>void saveProfile()}>{profileSaving?'Сохраняю…':'Сохранить профиль'}</button>{profileNotice&&<span>{profileNotice}</span>}</div>
      </>}
    </section>

    <section className="panel preference-panel">
      <div className="panel-head"><div><span className="eyebrow">Отображение</span><h3>Что показывать в дневнике</h3></div><Eye size={19}/></div>
      <p className="panel-description">Обязательные показатели всегда остаются. Здесь только необязательные поля.</p>
      <div className="preference-list">
        {optionalFields.map(item=>{
          const isVisible=visible[item.code]??true
          return <div className="preference-row" key={item.code}>
            <div className="preference-icon">{isVisible?<Eye size={17}/>:<EyeOff size={17}/>}</div>
            <div><strong>{item.label}</strong><span>{isVisible?'Будет показываться':'Скрыто из форм'}</span></div>
            <ToggleSwitch checked={isVisible} onChange={value=>setVisible(prev=>({...prev,[item.code]:value}))} label={'Показывать '+item.label}/>
          </div>
        })}
      </div>
    </section>

    <section className="panel preference-panel">
      <div className="panel-head"><div><span className="eyebrow">В приложении</span><h3>О чём мне напоминать</h3></div><Bell size={19}/></div>
      <div className="preference-list">
        {[
          ['weight','Взвешивание','ПН · СР · СБ утром'],
          ['waist','Замер талии','Раз в неделю'],
          ['workout','Тренировка','В тренировочный день'],
        ].map(([code,label,note])=><div className="preference-row" key={code}>
          <div className="preference-icon"><Bell size={17}/></div>
          <div><strong>{label}</strong><span>{note}</span></div>
          <ToggleSwitch checked={notifications[code as keyof typeof notifications]} onChange={value=>setNotifications(prev=>({...prev,[code]:value}))} label={'Напоминать: '+label}/>
        </div>)}
      </div>
    </section>
  </div>
}
