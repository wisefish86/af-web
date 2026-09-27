import { useEffect, useMemo, useState } from 'react'
import { Bell, Check, Eye, EyeOff, MessageCircle, ShieldCheck, Smartphone, UserRound } from 'lucide-react'
import { ToggleSwitch } from '../components/ToggleSwitch'
import { trackingGroups } from '../data/platformDemo'
import { loadMyProfile, saveMyProfile } from '../features/profile/service'
import { neutralAvatars, type ClientProfile } from '../features/profile/types'
import { loadNotificationPreferences, saveNotificationPreferences, type NotificationPreferences } from '../features/notifications/service'
import { supabase } from '../lib/supabase'
import type { UserRole } from '../lib/types'

const STORAGE_KEY = 'andrey-fitness-preview-preferences'
type Preferences = Record<string, boolean>
type Props={preview:boolean;role:UserRole}

const previewNotificationPreferences:NotificationPreferences={
  user_id:'preview',
  in_app_enabled:true,
  telegram_enabled:false,
  web_push_enabled:false,
  quiet_hours_enabled:true,
  quiet_start:'22:00:00',
  quiet_end:'08:00:00',
  timezone:'Europe/Moscow',
  digest_mode:'immediate',
}

function makePreviewProfile(role:UserRole):ClientProfile{
  return role==='trainer'
    ? {id:'preview-trainer',display_name:'Андрей',login_alias:null,nickname:'Тренер',age:null,city:null,timezone:'Europe/Moscow',avatar_key:'owl'}
    : {id:'preview',display_name:'Сергей',login_alias:null,nickname:'Музыкант',age:37,city:null,timezone:'Europe/Moscow',avatar_key:'fox'}
}

export function SettingsPage({preview,role}:Props) {
  const optionalFields = useMemo(
    () => trackingGroups.flatMap(group => group.items).filter(item => item.enabled && item.clientCanHide && !item.required),
    [],
  )
  const [visible, setVisible] = useState<Preferences>(() => {
    try { const raw=localStorage.getItem(STORAGE_KEY); if(raw)return JSON.parse(raw) } catch {}
    return Object.fromEntries(optionalFields.map(item => [item.code,true]))
  })
  const [profile,setProfile]=useState<ClientProfile>(()=>makePreviewProfile(role))
  const [notificationPrefs,setNotificationPrefs]=useState<NotificationPreferences>(previewNotificationPreferences)
  const [profileLoading,setProfileLoading]=useState(!preview)
  const [profileSaving,setProfileSaving]=useState(false)
  const [notificationSaving,setNotificationSaving]=useState(false)
  const [profileNotice,setProfileNotice]=useState('')
  const [notificationNotice,setNotificationNotice]=useState('')
  const [telegramBusy,setTelegramBusy]=useState(false)
  const [telegramNotice,setTelegramNotice]=useState('')
  const telegramBot=(import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string|undefined)?.replace(/^@/,'')

  useEffect(()=>{ localStorage.setItem(STORAGE_KEY,JSON.stringify(visible)) },[visible])

  useEffect(()=>{
    if(preview){
      setProfile(makePreviewProfile(role))
      setNotificationPrefs({...previewNotificationPreferences,user_id:role==='trainer'?'preview-trainer':'preview'})
      setProfileLoading(false)
      return
    }
    Promise.all([loadMyProfile(),loadNotificationPreferences()])
      .then(([p,n])=>{setProfile(p);setNotificationPrefs(n)})
      .catch(e=>setProfileNotice(e instanceof Error?e.message:'Не удалось загрузить настройки'))
      .finally(()=>setProfileLoading(false))
  },[preview,role])

  async function saveProfile(){
    if(!profile.display_name.trim()){setProfileNotice('Укажи имя.');return}
    setProfileSaving(true);setProfileNotice('')
    try{
      if(!preview) await saveMyProfile(profile)
      setProfileNotice('Профиль сохранён.')
    }catch(e){setProfileNotice(e instanceof Error?e.message:'Не удалось сохранить профиль')}
    finally{setProfileSaving(false)}
  }

  async function saveNotifications(){
    setNotificationSaving(true);setNotificationNotice('')
    try{
      const next={...notificationPrefs,timezone:profile.timezone}
      if(!preview) await saveNotificationPreferences(next)
      setNotificationPrefs(next)
      setNotificationNotice('Настройки уведомлений сохранены.')
    }catch(e){setNotificationNotice(e instanceof Error?e.message:'Не удалось сохранить уведомления')}
    finally{setNotificationSaving(false)}
  }

  async function connectTelegram(){
    if(!telegramBot){setTelegramNotice('Telegram-бот ещё не настроен. Основа привязки уже готова; нужен bot token и username.');return}
    if(preview){setTelegramNotice('В preview Telegram не подключается.');return}
    if(!supabase)return
    setTelegramBusy(true);setTelegramNotice('')
    try{
      const {data,error}=await supabase.rpc('create_my_telegram_link_token')
      if(error)throw error
      window.open('https://t.me/'+telegramBot+'?start='+encodeURIComponent(String(data)),'_blank','noopener,noreferrer')
      setTelegramNotice('Открываю Telegram. Одноразовый код действует 15 минут.')
    }catch(e){setTelegramNotice(e instanceof Error?e.message:'Не удалось создать ссылку')}
    finally{setTelegramBusy(false)}
  }

  return <div className="page-stack settings-page">
    <section className="section-intro settings-hero">
      <div>
        <span className="eyebrow">Мой кабинет</span>
        <h2>Профиль и настройки</h2>
        <p>{role==='trainer'?'Профиль тренера готов к будущей работе с несколькими специалистами и их клиентами.':'Только данные, которые действительно нужны для сопровождения. Личную фотографию загружать не требуется.'}</p>
      </div>
      <div className="calm-badge"><ShieldCheck size={18}/><span>Минимум лишних данных</span></div>
    </section>

    <section className="panel profile-settings-panel">
      <div className="panel-head"><div><span className="eyebrow">Профиль</span><h3>Как тебя показывать в приложении</h3></div><UserRound size={19}/></div>
      {profileLoading ? <div className="library-empty">Загружаю профиль…</div> : <>
        <div className="profile-avatar-picker">
          {neutralAvatars.map(a=><button key={a.key} className={profile.avatar_key===a.key?'is-active':''} onClick={()=>setProfile(p=>({...p,avatar_key:a.key}))} title={a.label}><span>{a.emoji}</span>{profile.avatar_key===a.key&&<Check size={12}/>}</button>)}
        </div>
        <div className="form-grid-3 profile-form-grid">
          <label className="field-label">Имя / как обращаться<input value={profile.display_name} maxLength={60} onChange={e=>setProfile(p=>({...p,display_name:e.target.value}))}/></label>
          <label className="field-label">Никнейм / метка<input value={profile.nickname??''} maxLength={40} onChange={e=>setProfile(p=>({...p,nickname:e.target.value||null}))} placeholder={role==='trainer'?'Например: Андрей':'Например: Музыкант'}/></label>
          {role==='client'&&<label className="field-label">Возраст<input type="number" min="13" max="100" value={profile.age??''} onChange={e=>setProfile(p=>({...p,age:e.target.value===''?null:Number(e.target.value)}))}/></label>}
          <label className="field-label">Город <small>необязательно</small><input value={profile.city??''} maxLength={80} onChange={e=>setProfile(p=>({...p,city:e.target.value||null}))} placeholder="Можно не указывать"/></label>
          <label className="field-label">Часовой пояс<select value={profile.timezone} onChange={e=>setProfile(p=>({...p,timezone:e.target.value}))}><option value="Europe/Moscow">Москва (UTC+3)</option><option value="Europe/Kaliningrad">Калининград (UTC+2)</option><option value="Asia/Yekaterinburg">Екатеринбург (UTC+5)</option><option value="Asia/Novosibirsk">Новосибирск (UTC+7)</option><option value="Asia/Vladivostok">Владивосток (UTC+10)</option></select></label>
        </div>
        <div className="profile-save-row"><button className="primary-button compact" disabled={profileSaving} onClick={()=>void saveProfile()}>{profileSaving?'Сохраняю…':'Сохранить профиль'}</button>{profileNotice&&<span>{profileNotice}</span>}</div>
      </>}
    </section>

    <section className="panel preference-panel notification-settings-panel">
      <div className="panel-head"><div><span className="eyebrow">Уведомления</span><h3>Каналы и режим тишины</h3></div><Bell size={19}/></div>
      <p className="panel-description">Правила напоминаний задаются отдельно. Здесь выбирается, куда их доставлять и когда не беспокоить.</p>
      <div className="preference-list">
        <div className="preference-row">
          <div className="preference-icon"><Bell size={17}/></div>
          <div><strong>В приложении</strong><span>Центр уведомлений и счётчик непрочитанных.</span></div>
          <ToggleSwitch checked={notificationPrefs.in_app_enabled} onChange={value=>setNotificationPrefs(p=>({...p,in_app_enabled:value}))} label="Уведомления в приложении"/>
        </div>
        <div className="preference-row">
          <div className="preference-icon"><MessageCircle size={17}/></div>
          <div><strong>Telegram</strong><span>{telegramBot?'После привязки можно использовать для напоминаний.':'Основа готова; бот ещё не подключён.'}</span></div>
          <button className="ghost-button compact telegram-connect-button" disabled={telegramBusy} onClick={()=>void connectTelegram()}>{telegramBot?'Подключить':'Настроить позже'}</button>
        </div>
        <div className="preference-row is-muted">
          <div className="preference-icon"><Smartphone size={17}/></div>
          <div><strong>PWA push</strong><span>Архитектура предусмотрена; внешний push-доставщик будет подключён отдельно.</span></div>
          <span className="soft-chip">следующий этап</span>
        </div>
      </div>

      <div className="quiet-hours-box">
        <div className="quiet-hours-head"><div><strong>Режим тишины</strong><span>Внешние уведомления не должны приходить ночью.</span></div><ToggleSwitch checked={notificationPrefs.quiet_hours_enabled} onChange={value=>setNotificationPrefs(p=>({...p,quiet_hours_enabled:value}))} label="Режим тишины"/></div>
        {notificationPrefs.quiet_hours_enabled&&<div className="quiet-hours-times">
          <label>С<input type="time" value={notificationPrefs.quiet_start.slice(0,5)} onChange={e=>setNotificationPrefs(p=>({...p,quiet_start:e.target.value+':00'}))}/></label>
          <label>До<input type="time" value={notificationPrefs.quiet_end.slice(0,5)} onChange={e=>setNotificationPrefs(p=>({...p,quiet_end:e.target.value+':00'}))}/></label>
          <label>Режим<select value={notificationPrefs.digest_mode} onChange={e=>setNotificationPrefs(p=>({...p,digest_mode:e.target.value as NotificationPreferences['digest_mode']}))}><option value="immediate">Сразу</option><option value="morning_digest">Утренний дайджест</option><option value="evening_digest">Вечерний дайджест</option></select></label>
        </div>}
      </div>

      <div className="profile-save-row"><button className="primary-button compact" disabled={notificationSaving} onClick={()=>void saveNotifications()}>{notificationSaving?'Сохраняю…':'Сохранить уведомления'}</button>{notificationNotice&&<span>{notificationNotice}</span>}</div>
      {telegramNotice&&<div className="settings-inline-notice">{telegramNotice}</div>}
    </section>

    {role==='client'&&<section className="panel preference-panel">
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
    </section>}
  </div>
}
