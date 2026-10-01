import { useEffect, useState } from 'react'
import { Bell, Check, Eye, EyeOff, MessageCircle, ShieldCheck, UserRound } from 'lucide-react'
import { ToggleSwitch } from '../components/ToggleSwitch'
import { PwaInstallPanel } from '../components/PwaInstallPanel'
import { loadMyProfile, saveMyProfile } from '../features/profile/service'
import { neutralAvatars, type ClientProfile } from '../features/profile/types'
import { loadNotificationPreferences, saveNotificationPreferences, type NotificationPreferences } from '../features/notifications/service'
import { loadMyTrackingSetup, setMyTrackingPreference, type TrackingFieldState } from '../features/tracking/service'
import type { UserRole } from '../lib/types'
import { setAppTimeZone } from '../lib/appDate'
import { showAppToast } from '../lib/toast'
import { loadMyTrainerContactSettings, saveMyTrainerContactSettings } from '../features/contacts/service'

type Props={preview:boolean;role:UserRole}
const previewNotificationPreferences:NotificationPreferences={
  user_id:'preview',in_app_enabled:true,telegram_enabled:false,web_push_enabled:false,
  quiet_hours_enabled:true,quiet_start:'22:00:00',quiet_end:'08:00:00',
  timezone:'Europe/Moscow',digest_mode:'immediate',
}
function makePreviewProfile(role:UserRole):ClientProfile{
  return role==='trainer'
    ? {id:'preview-trainer',display_name:'Андрей',login_alias:null,nickname:'Тренер',age:null,city:null,timezone:'Europe/Moscow',avatar_key:'owl'}
    : {id:'preview',display_name:'Сергей',login_alias:null,nickname:'Музыкант',age:37,city:null,timezone:'Europe/Moscow',avatar_key:'fox'}
}
const previewTracking:TrackingFieldState[]=[
  ['hunger','daily','Голод'],['energy','daily','Энергия'],['stress','daily','Стресс'],
  ['sleep','daily','Сон'],['ease','daily','Насколько легко соблюдать питание'],
  ['waist','measurements','Талия'],['chest','measurements','Грудь'],['hips','measurements','Таз'],
  ['thigh','measurements','Бедро'],['arm_relaxed','measurements','Рука расслаблена'],['arm_flexed','measurements','Рука напряжена'],
  ['appearance','monthly','Внешний вид'],['fitness','monthly','Форма'],['physical_comfort','monthly','Физический комфорт'],
  ['sleep_recovery','monthly','Сон и восстановление'],['nutrition','monthly','Питание'],
].map(([code,section,label])=>({code,section,label,unit:null,enabled:true,required:false,frequency:null,client_can_disable:true,hidden:false,reminder_enabled:true,settings:{}}))

export function SettingsPage({preview,role}:Props){
  const [profile,setProfile]=useState<ClientProfile>(()=>makePreviewProfile(role))
  const [notificationPrefs,setNotificationPrefs]=useState<NotificationPreferences>(previewNotificationPreferences)
  const [tracking,setTracking]=useState<TrackingFieldState[]>(preview&&role==='client'?previewTracking:[])
  const [loading,setLoading]=useState(!preview)
  const [profileLoaded,setProfileLoaded]=useState(preview)
  const [notificationsLoaded,setNotificationsLoaded]=useState(preview)
  const [trackingLoaded,setTrackingLoaded]=useState(preview||role!=='client')
  const [saving,setSaving]=useState(false)
  const [notificationSaving,setNotificationSaving]=useState(false)
  const [trackingSavingCodes,setTrackingSavingCodes]=useState<string[]>([])
  const [trainerContacts,setTrainerContacts]=useState({telegram:'',whatsapp:'',max:''})
  const [trainerContactsLoaded,setTrainerContactsLoaded]=useState(role!=='trainer')
  const [trainerContactsSaving,setTrainerContactsSaving]=useState(false)
  const [notice,setNotice]=useState('')
  useEffect(()=>{
    if(preview){
      setProfile(makePreviewProfile(role))
      setNotificationPrefs({...previewNotificationPreferences,user_id:role==='trainer'?'preview-trainer':'preview'})
      setTracking(role==='client'?previewTracking:[])
      setProfileLoaded(true);setNotificationsLoaded(true);setTrackingLoaded(true)
      setLoading(false)
      return
    }
    Promise.allSettled([
      loadMyProfile(),
      loadNotificationPreferences(),
      role==='client'?loadMyTrackingSetup():Promise.resolve([] as TrackingFieldState[]),
    ]).then(([profileResult,notificationResult,trackingResult])=>{
      const failed:string[]=[]
      if(profileResult.status==='fulfilled'){setProfile(profileResult.value);setProfileLoaded(true)}
      else {setProfileLoaded(false);failed.push('профиль')}
      if(notificationResult.status==='fulfilled'){setNotificationPrefs(notificationResult.value);setNotificationsLoaded(true)}
      else {setNotificationsLoaded(false);failed.push('уведомления')}
      if(trackingResult.status==='fulfilled'){setTracking(trackingResult.value);setTrackingLoaded(true)}
      else {setTrackingLoaded(false);failed.push('персонализация полей')}
      setNotice(failed.length?'Часть настроек не загрузилась: '+failed.join(', ')+'. Доступные разделы можно использовать.':'')
    }).finally(()=>setLoading(false))
  },[preview,role])

  useEffect(()=>{
    if(role!=='trainer')return
    if(preview){
      setTrainerContacts({telegram:'https://t.me/example',whatsapp:'https://wa.me/79990000000',max:'https://max.ru/example'})
      setTrainerContactsLoaded(true)
      return
    }
    let cancelled=false
    setTrainerContactsLoaded(false)
    loadMyTrainerContactSettings().then(items=>{
      if(cancelled)return
      const next={telegram:'',whatsapp:'',max:''}
      for(const item of items)next[item.channel]=item.url
      setTrainerContacts(next)
      setTrainerContactsLoaded(true)
    }).catch(e=>{
      if(!cancelled){
        setTrainerContactsLoaded(false)
        setNotice(e instanceof Error?e.message:'Не удалось загрузить контакты тренера')
      }
    })
    return()=>{cancelled=true}
  },[preview,role])

  async function saveTrainerContacts(){
    if(role!=='trainer'||trainerContactsSaving)return
    setTrainerContactsSaving(true);setNotice('')
    try{
      if(!preview)await saveMyTrainerContactSettings(trainerContacts)
      showAppToast('Контакты для связи сохранены.')
    }catch(e){setNotice(e instanceof Error?e.message:'Не удалось сохранить контакты')}
    finally{setTrainerContactsSaving(false)}
  }

  async function saveProfile(){
    if(!profileLoaded){setNotice('Профиль не загрузился. Сохранение временно отключено.');return}
    if(!profile.display_name.trim()){setNotice('Укажи имя.');return}
    if(role==='client'&&profile.age!=null&&(!Number.isInteger(profile.age)||profile.age<13||profile.age>100)){setNotice('Возраст должен быть от 13 до 100 лет.');return}
    setSaving(true);setNotice('')
    try{
      if(!preview)await saveMyProfile(profile)
      setAppTimeZone(profile.timezone)
      setNotificationPrefs(current=>({...current,timezone:profile.timezone}))
      showAppToast('Профиль сохранён.')
    }catch(e){setNotice(e instanceof Error?e.message:'Не удалось сохранить профиль')}
    finally{setSaving(false)}
  }

  async function toggleTracking(field:TrackingFieldState){
    if(!trackingLoaded||trackingSavingCodes.includes(field.code)||!field.client_can_disable||field.required)return
    const hidden=!field.hidden
    setTrackingSavingCodes(codes=>[...codes,field.code])
    setTracking(list=>list.map(x=>x.code===field.code?{...x,hidden}:x))
    if(preview){setTrackingSavingCodes(codes=>codes.filter(code=>code!==field.code));return}
    try{await setMyTrackingPreference(field.code,hidden)}
    catch(e){
      setTracking(list=>list.map(x=>x.code===field.code?{...x,hidden:field.hidden}:x))
      setNotice(e instanceof Error?e.message:'Не удалось изменить вопрос')
    }finally{setTrackingSavingCodes(codes=>codes.filter(code=>code!==field.code))}
  }

  async function toggleInApp(value:boolean){
    if(!notificationsLoaded||notificationSaving)return
    const previous=notificationPrefs
    const next={...notificationPrefs,in_app_enabled:value,timezone:profile.timezone}
    setNotificationPrefs(next);setNotificationSaving(true)
    if(preview){setNotificationSaving(false);return}
    try{await saveNotificationPreferences(next)}
    catch(e){
      setNotificationPrefs(previous)
      setNotice(e instanceof Error?e.message:'Не удалось изменить уведомления')
    }finally{setNotificationSaving(false)}
  }

  const optionalTracking=tracking.filter(f=>f.enabled&&f.client_can_disable&&!f.required&&!['calories','protein','steps','trained'].includes(f.code))
  const groups=[
    {section:'daily',title:'Ежедневные вопросы',description:'Короткое самочувствие. Отключённые вопросы исчезнут с главной.'},
    {section:'measurements',title:'Замеры',description:'Вес остаётся базовым показателем; остальные замеры можно скрыть.'},
    {section:'monthly',title:'Ежемесячный обзор',description:'Оставь только те оценки, которые реально полезны тебе и тренеру.'},
  ]

  return <div className="page-stack settings-page">
    <section className="section-intro settings-hero">
      <div><span className="eyebrow">Мой кабинет</span><h2>Профиль и настройки</h2><p>{role==='trainer'?'Профиль тренера и общие настройки кабинета.':'Можно убрать лишние вопросы, не ломая историю уже заполненных данных.'}</p></div>
      <div className="calm-badge"><ShieldCheck size={18}/><span>Минимум лишних данных</span></div>
    </section>

    {notice&&<div className="drawer-notice">{notice}</div>}

    <section className="panel profile-settings-panel">
      <div className="panel-head"><div><span className="eyebrow">Профиль</span><h3>Как тебя показывать</h3></div><UserRound size={19}/></div>
      {loading?<div className="library-empty">Загружаю профиль…</div>:!profileLoaded?<div className="library-empty">Не удалось загрузить профиль. Поля не показаны, чтобы не подменять реальные данные значениями по умолчанию.</div>:<>
        <div className="profile-avatar-picker">{neutralAvatars.map(a=><button key={a.key} className={profile.avatar_key===a.key?'is-active':''} onClick={()=>setProfile(p=>({...p,avatar_key:a.key}))} title={a.label}><span>{a.emoji}</span>{profile.avatar_key===a.key&&<Check size={12}/>}</button>)}</div>
        <div className="form-grid-3 profile-form-grid">
          <label className="field-label">Имя / как обращаться<input value={profile.display_name} maxLength={60} onChange={e=>setProfile(p=>({...p,display_name:e.target.value}))}/></label>
          <label className="field-label">Никнейм / метка<input value={profile.nickname??''} maxLength={40} onChange={e=>setProfile(p=>({...p,nickname:e.target.value||null}))} placeholder={role==='trainer'?'Например: Андрей':'Например: Музыкант'}/></label>
          {role==='client'&&<label className="field-label">Возраст<input type="number" min="13" max="100" value={profile.age??''} onChange={e=>setProfile(p=>({...p,age:e.target.value===''?null:Number(e.target.value)}))}/></label>}
          <label className="field-label">Город <small>необязательно</small><input value={profile.city??''} maxLength={80} onChange={e=>setProfile(p=>({...p,city:e.target.value||null}))} placeholder="Можно не указывать"/></label>
          <label className="field-label">Часовой пояс<select value={profile.timezone} onChange={e=>setProfile(p=>({...p,timezone:e.target.value}))}><option value="Europe/Moscow">Москва (UTC+3)</option><option value="Europe/Kaliningrad">Калининград (UTC+2)</option><option value="Asia/Yekaterinburg">Екатеринбург (UTC+5)</option><option value="Asia/Novosibirsk">Новосибирск (UTC+7)</option><option value="Asia/Vladivostok">Владивосток (UTC+10)</option></select></label>
        </div>
        <div className="profile-save-row"><button className="primary-button compact" disabled={saving} onClick={()=>void saveProfile()}>{saving?'Сохраняю…':'Сохранить профиль'}</button></div>
      </>}
    </section>

    <PwaInstallPanel/>

    {role==='trainer'&&<section className="panel trainer-contact-settings">
      <div className="panel-head"><div><span className="eyebrow">Связь с клиентом</span><h3>Чат с тренером</h3></div><MessageCircle size={19}/></div>
      <p className="panel-description">Заполни только те мессенджеры, которыми реально пользуешься. У клиента появится одна кнопка «Чат с тренером», а внутри — выбор доступных каналов.</p>
      {!trainerContactsLoaded?<div className="library-empty">Не удалось загрузить контакты.</div>:<>
        <div className="trainer-contact-grid">
          <label className="field-label">Telegram<input type="url" value={trainerContacts.telegram} onChange={e=>setTrainerContacts(v=>({...v,telegram:e.target.value}))} placeholder="https://t.me/username"/></label>
          <label className="field-label">WhatsApp<input type="url" value={trainerContacts.whatsapp} onChange={e=>setTrainerContacts(v=>({...v,whatsapp:e.target.value}))} placeholder="https://wa.me/79990000000"/></label>
          <label className="field-label">MAX<input type="url" value={trainerContacts.max} onChange={e=>setTrainerContacts(v=>({...v,max:e.target.value}))} placeholder="https://max.ru/..."/></label>
        </div>
        <div className="profile-save-row"><button className="primary-button compact" disabled={trainerContactsSaving} onClick={()=>void saveTrainerContacts()}>{trainerContactsSaving?'Сохраняю…':'Сохранить мессенджеры'}</button></div>
      </>}
    </section>}

    <section className="panel preference-panel">
      <div className="panel-head"><div><span className="eyebrow">Уведомления</span><h3>Напоминания внутри приложения</h3></div><Bell size={19}/></div>
      <p className="panel-description">Центр уведомлений Andrey Fit работает уже сейчас. Telegram подключаем к той же системе постепенно, поэтому правила напоминаний и прямые ссылки не придётся создавать заново.</p>
      {!notificationsLoaded?<div className="library-empty">Не удалось загрузить настройки уведомлений.</div>:<div className="preference-row">
        <div className="preference-icon"><Bell size={17}/></div>
        <div><strong>Показывать напоминания</strong><span>Колокольчик и центр уведомлений. Список задач на сегодня остаётся частью плана.</span></div>
        <ToggleSwitch checked={notificationPrefs.in_app_enabled} disabled={notificationSaving} onChange={value=>void toggleInApp(value)} label="Уведомления внутри приложения"/>
      </div>}
    </section>

    {role==='client'&&trackingLoaded&&groups.map(group=>{
      const fields=optionalTracking.filter(f=>f.section===group.section)
      if(!fields.length)return null
      return <section className="panel preference-panel" key={group.section}>
        <div className="panel-head"><div><span className="eyebrow">Персонализация</span><h3>{group.title}</h3></div><Eye size={19}/></div>
        <p className="panel-description">{group.description}</p>
        <div className="preference-list">{fields.map(field=><div className="preference-row" key={field.code}>
          <div className="preference-icon">{field.hidden?<EyeOff size={17}/>:<Eye size={17}/>}</div>
          <div><strong>{field.label}</strong><span>{field.hidden?'Скрыто из форм':'Показывается в формах'}</span></div>
          <ToggleSwitch checked={!field.hidden} disabled={trackingSavingCodes.includes(field.code)} onChange={()=>void toggleTracking(field)} label={'Показывать '+field.label}/>
        </div>)}</div>
      </section>
    })}
  </div>
}
