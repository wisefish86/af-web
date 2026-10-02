import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, Check, Eye, EyeOff, KeyRound, MailCheck, MessageCircle, ShieldCheck, UserRound } from 'lucide-react'
import { ToggleSwitch } from '../components/ToggleSwitch'
import { PwaInstallPanel } from '../components/PwaInstallPanel'
import { loadMyProfile, loadTrainerSecurityInfo, saveMyProfile, sendMyTrainerPasswordRecovery, type TrainerSecurityInfo } from '../features/profile/service'
import { neutralAvatars, type ClientProfile } from '../features/profile/types'
import { defaultNotificationTopicPreferences, loadNotificationPreferences, loadNotificationTopicPreferences, saveNotificationPreferences, saveNotificationTopicPreference, type NotificationPreferences, type NotificationTopicCode, type NotificationTopicPreferences } from '../features/notifications/service'
import { loadMyTrackingSetup, setMyTrackingPreference, type TrackingFieldState } from '../features/tracking/service'
import type { UserRole } from '../lib/types'
import { setAppTimeZone } from '../lib/appDate'
import { showAppToast } from '../lib/toast'
import { contactSettingsFromRows, emptyTrainerContactSettings, loadMyTrainerContactSettings, saveMyTrainerContactSettings } from '../features/contacts/service'
import { emptyTrainerPublicProfileDraft, loadMyTrainerPublicProfileDraft, saveMyTrainerPublicProfileDraft, type TrainerPublicProfileDraft } from '../features/trainerProfile/service'

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
  const [telegramTopics,setTelegramTopics]=useState<NotificationTopicPreferences>({...defaultNotificationTopicPreferences})
  const [telegramTopicsLoaded,setTelegramTopicsLoaded]=useState(preview)
  const [telegramTopicSaving,setTelegramTopicSaving]=useState<NotificationTopicCode[]>([])
  const [tracking,setTracking]=useState<TrackingFieldState[]>(preview&&role==='client'?previewTracking:[])
  const [loading,setLoading]=useState(!preview)
  const [profileLoaded,setProfileLoaded]=useState(preview)
  const [notificationsLoaded,setNotificationsLoaded]=useState(preview)
  const [trackingLoaded,setTrackingLoaded]=useState(preview||role!=='client')
  const [saving,setSaving]=useState(false)
  const [notificationSaving,setNotificationSaving]=useState(false)
  const [trackingSavingCodes,setTrackingSavingCodes]=useState<string[]>([])
  const [trainerContacts,setTrainerContacts]=useState({...emptyTrainerContactSettings})
  const [trainerContactsLoaded,setTrainerContactsLoaded]=useState(role!=='trainer')
  const [trainerContactsSaving,setTrainerContactsSaving]=useState(false)
  const [trainerPublicProfile,setTrainerPublicProfile]=useState<TrainerPublicProfileDraft>({...emptyTrainerPublicProfileDraft})
  const [trainerPublicProfileLoaded,setTrainerPublicProfileLoaded]=useState(role!=='trainer')
  const [trainerPublicProfileSaving,setTrainerPublicProfileSaving]=useState(false)
  const [trainerSecurity,setTrainerSecurity]=useState<TrainerSecurityInfo|null>(preview&&role==='trainer'?{email:'trainer@example.com',emailConfirmed:true,lastSignInAt:null}:null)
  const [trainerSecurityLoaded,setTrainerSecurityLoaded]=useState(preview||role!=='trainer')
  const [trainerRecoverySending,setTrainerRecoverySending]=useState(false)
  const [notice,setNotice]=useState('')
  useEffect(()=>{
    if(preview){
      setProfile(makePreviewProfile(role))
      setNotificationPrefs({...previewNotificationPreferences,user_id:role==='trainer'?'preview-trainer':'preview'})
      setTelegramTopics({...defaultNotificationTopicPreferences})
      setTelegramTopicsLoaded(true)
      setTracking(role==='client'?previewTracking:[])
      setProfileLoaded(true);setNotificationsLoaded(true);setTrackingLoaded(true)
      setLoading(false)
      return
    }
    Promise.allSettled([
      loadMyProfile(),
      loadNotificationPreferences(),
      loadNotificationTopicPreferences('telegram'),
      role==='client'?loadMyTrackingSetup():Promise.resolve([] as TrackingFieldState[]),
    ]).then(([profileResult,notificationResult,telegramTopicResult,trackingResult])=>{
      const failed:string[]=[]
      if(profileResult.status==='fulfilled'){setProfile(profileResult.value);setProfileLoaded(true)}
      else {setProfileLoaded(false);failed.push('профиль')}
      if(notificationResult.status==='fulfilled'){setNotificationPrefs(notificationResult.value);setNotificationsLoaded(true)}
      else {setNotificationsLoaded(false);failed.push('уведомления')}
      if(telegramTopicResult.status==='fulfilled'){setTelegramTopics(telegramTopicResult.value);setTelegramTopicsLoaded(true)}
      else {setTelegramTopicsLoaded(false);failed.push('категории Telegram')}
      if(trackingResult.status==='fulfilled'){setTracking(trackingResult.value);setTrackingLoaded(true)}
      else {setTrackingLoaded(false);failed.push('персонализация полей')}
      setNotice(failed.length?'Часть настроек не загрузилась: '+failed.join(', ')+'. Доступные разделы можно использовать.':'')
    }).finally(()=>setLoading(false))
  },[preview,role])

  useEffect(()=>{
    if(role!=='trainer')return
    if(preview){
      setTrainerContacts({
        telegram:'https://t.me/example',
        whatsapp:'https://wa.me/79990000000',
        max:'https://max.ru/example',
        phone:'+79990000000',
        instagram:'https://instagram.com/example',
        website:'https://example.com',
      })
      setTrainerPublicProfile({
        headline:'Тренер ANDREWAY Fit',
        welcome_message:'Привет! Здесь можно рассказать клиенту о себе и своём подходе.',
        about_text:'Коротко о тренере и том, чем он может быть полезен.',
        experience_text:'Опыт работы и важные проекты.',
        approach_text:'Как строится сопровождение и на каких принципах.',
        specialties_text:'Основные направления работы.',
        education_text:'Обучение и квалификация.',
        is_published:true,
      })
      setTrainerContactsLoaded(true)
      setTrainerPublicProfileLoaded(true)
      return
    }
    let cancelled=false
    setTrainerContactsLoaded(false)
    setTrainerPublicProfileLoaded(false)
    setTrainerSecurityLoaded(false)
    Promise.allSettled([loadMyTrainerContactSettings(),loadMyTrainerPublicProfileDraft(),loadTrainerSecurityInfo()])
      .then(([contactsResult,publicProfileResult,securityResult])=>{
        if(cancelled)return
        const failed:string[]=[]
        if(contactsResult.status==='fulfilled'){
          setTrainerContacts(contactSettingsFromRows(contactsResult.value))
          setTrainerContactsLoaded(true)
        }else failed.push('контакты')
        if(publicProfileResult.status==='fulfilled'){
          setTrainerPublicProfile(publicProfileResult.value)
          setTrainerPublicProfileLoaded(true)
        }else failed.push('публичный профиль')
        if(securityResult.status==='fulfilled'){
          setTrainerSecurity(securityResult.value)
          setTrainerSecurityLoaded(true)
        }else failed.push('безопасность аккаунта')
        if(failed.length)setNotice('Часть настроек тренера не загрузилась: '+failed.join(', ')+'. Остальные разделы можно использовать.')
      })
    return()=>{cancelled=true}
  },[preview,role])

  async function sendTrainerRecovery(){
    if(role!=='trainer'||trainerRecoverySending)return
    setTrainerRecoverySending(true);setNotice('')
    try{
      if(!preview)await sendMyTrainerPasswordRecovery()
      showAppToast('Ссылка для восстановления отправлена на email тренера.')
    }catch(e){setNotice(e instanceof Error?e.message:'Не удалось отправить ссылку восстановления')}
    finally{setTrainerRecoverySending(false)}
  }

  async function saveTrainerContacts(){
    if(role!=='trainer'||trainerContactsSaving)return
    setTrainerContactsSaving(true);setNotice('')
    try{
      if(!preview)await saveMyTrainerContactSettings(trainerContacts)
      showAppToast('Контакты и соцсети сохранены.')
    }catch(e){setNotice(e instanceof Error?e.message:'Не удалось сохранить контакты')}
    finally{setTrainerContactsSaving(false)}
  }

  async function saveTrainerPublicProfile(){
    if(role!=='trainer'||trainerPublicProfileSaving)return
    setTrainerPublicProfileSaving(true);setNotice('')
    try{
      if(!preview)await saveMyTrainerPublicProfileDraft(trainerPublicProfile)
      showAppToast('Публичная страница тренера сохранена.')
    }catch(e){setNotice(e instanceof Error?e.message:'Не удалось сохранить публичную страницу')}
    finally{setTrainerPublicProfileSaving(false)}
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
      window.dispatchEvent(new CustomEvent('andrey-fit-profile-name-changed',{detail:{name:profile.display_name.trim()}}))
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

  async function toggleTelegramTopic(topic:NotificationTopicCode,value:boolean){
    if(!telegramTopicsLoaded||telegramTopicSaving.includes(topic))return
    const previous=telegramTopics[topic]
    setTelegramTopics(current=>({...current,[topic]:value}))
    setTelegramTopicSaving(current=>[...current,topic])
    if(preview){setTelegramTopicSaving(current=>current.filter(x=>x!==topic));return}
    try{await saveNotificationTopicPreference(topic,value,'telegram')}
    catch(e){
      setTelegramTopics(current=>({...current,[topic]:previous}))
      setNotice(e instanceof Error?e.message:'Не удалось изменить Telegram-настройку')
    }finally{setTelegramTopicSaving(current=>current.filter(x=>x!==topic))}
  }

  const telegramTopicMeta:{code:NotificationTopicCode;title:string;description:string}[]=[
    {code:'feedback',title:'Сообщения и ответы тренера',description:'Комментарии к тренировкам и ответы в переписке.'},
    {code:'workouts',title:'Тренировки',description:'Напоминания о тренировках и связанные события.'},
    {code:'progress',title:'Прогресс и замеры',description:'Вес, талия, ежемесячные замеры и контроль прогресса.'},
    {code:'nutrition',title:'Питание',description:'Напоминания по Meal Plan и дневной отметке питания.'},
    {code:'checkins',title:'Самочувствие и отчёты',description:'Дневные и ежемесячные контрольные отметки.'},
    {code:'general',title:'Сервисные сообщения',description:'Редкие общие уведомления, не относящиеся к отдельному модулю.'},
  ]

  const optionalTracking=tracking.filter(f=>f.enabled&&f.client_can_disable&&!f.required&&!['calories','protein','steps','trained'].includes(f.code))
  const groups=[
    {section:'daily',title:'Ежедневные вопросы',description:'Короткое самочувствие. Отключённые вопросы исчезнут с главной.'},
    {section:'measurements',title:'Замеры',description:'Вес остаётся базовым показателем; остальные замеры можно скрыть.'},
    {section:'monthly',title:'Контрольная самооценка',description:'Оставь только те оценки, которые реально полезны тебе и тренеру. Раз в 30 дней — рекомендация, пройти можно раньше.'},
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

    {role==='trainer'&&<section className="panel trainer-security-panel">
      <div className="panel-head"><div><span className="eyebrow">Безопасность</span><h3>Аккаунт тренера</h3></div><ShieldCheck size={19}/></div>
      {!trainerSecurityLoaded
        ? <div className="library-empty">Не удалось проверить email аккаунта.</div>
        : trainerSecurity&&<>
          <div className="trainer-security-email">
            <div><MailCheck size={18}/><div><span>Email для входа и восстановления</span><strong>{trainerSecurity.email}</strong></div></div>
            <span className={'status-pill '+(trainerSecurity.emailConfirmed?'':'is-warning')}>{trainerSecurity.emailConfirmed?'Подтверждён':'Не подтверждён'}</span>
          </div>
          <p className="panel-description">Для тренера email остаётся независимым способом восстановить доступ. Клиентские аккаунты по-прежнему используют логин и сброс через тренера.</p>
          <button className="ghost-button compact" disabled={trainerRecoverySending||!trainerSecurity.emailConfirmed} onClick={()=>void sendTrainerRecovery()}><KeyRound size={16}/>{trainerRecoverySending?'Отправляю…':'Отправить ссылку для восстановления'}</button>
        </>}
    </section>}

    {role==='trainer'&&<section className="panel trainer-public-settings">
      <div className="panel-head">
        <div><span className="eyebrow">Для клиентов</span><h3>Публичная страница тренера</h3></div>
        <Link className="ghost-button compact" to="/trainer">Посмотреть страницу</Link>
      </div>
      <p className="panel-description">Эти данные видят только твои активные клиенты. Пустые блоки на странице не показываются.</p>
      {!trainerPublicProfileLoaded?<div className="library-empty">Не удалось загрузить публичный профиль.</div>:<>
        <div className="trainer-public-settings-grid">
          <label className="field-label wide">Заголовок<input maxLength={100} value={trainerPublicProfile.headline} onChange={e=>setTrainerPublicProfile(v=>({...v,headline:e.target.value}))} placeholder="Например: Тренер по силовым тренировкам и питанию"/></label>
          <label className="field-label wide">Приветственное слово<textarea rows={3} maxLength={700} value={trainerPublicProfile.welcome_message} onChange={e=>setTrainerPublicProfile(v=>({...v,welcome_message:e.target.value}))} placeholder="Короткое личное обращение к клиенту"/></label>
          <label className="field-label">Обо мне<textarea rows={4} maxLength={1600} value={trainerPublicProfile.about_text} onChange={e=>setTrainerPublicProfile(v=>({...v,about_text:e.target.value}))} placeholder="Кто ты и чем помогаешь"/></label>
          <label className="field-label">Опыт<textarea rows={4} maxLength={1600} value={trainerPublicProfile.experience_text} onChange={e=>setTrainerPublicProfile(v=>({...v,experience_text:e.target.value}))} placeholder="Опыт работы, проекты, направления"/></label>
          <label className="field-label">Подход к сопровождению<textarea rows={4} maxLength={1600} value={trainerPublicProfile.approach_text} onChange={e=>setTrainerPublicProfile(v=>({...v,approach_text:e.target.value}))} placeholder="Как ты работаешь с клиентом"/></label>
          <label className="field-label">Специализация<textarea rows={4} maxLength={1200} value={trainerPublicProfile.specialties_text} onChange={e=>setTrainerPublicProfile(v=>({...v,specialties_text:e.target.value}))} placeholder="Снижение веса, силовые, питание…"/></label>
          <label className="field-label wide">Обучение и квалификация<textarea rows={3} maxLength={1600} value={trainerPublicProfile.education_text} onChange={e=>setTrainerPublicProfile(v=>({...v,education_text:e.target.value}))} placeholder="Курсы, сертификаты, образование — только то, что хочешь показывать клиенту"/></label>
        </div>
        <div className="trainer-public-publish-row">
          <div><strong>Показывать страницу клиентам</strong><span>Если выключить, клиент увидит, что профиль пока не опубликован.</span></div>
          <ToggleSwitch checked={trainerPublicProfile.is_published} onChange={value=>setTrainerPublicProfile(v=>({...v,is_published:value}))} label="Публикация профиля тренера"/>
        </div>
        <div className="profile-save-row"><button className="primary-button compact" disabled={trainerPublicProfileSaving} onClick={()=>void saveTrainerPublicProfile()}>{trainerPublicProfileSaving?'Сохраняю…':'Сохранить страницу'}</button></div>
      </>}
    </section>}

    <PwaInstallPanel/>

    {role==='trainer'&&<section className="panel trainer-contact-settings">
      <div className="panel-head"><div><span className="eyebrow">Связь с клиентом</span><h3>Контакты и соцсети</h3></div><MessageCircle size={19}/></div>
      <p className="panel-description">Мессенджеры попадут в кнопку «Чат с тренером». Телефон, Instagram и сайт будут доступны на странице «О тренере».</p>
      {!trainerContactsLoaded?<div className="library-empty">Не удалось загрузить контакты.</div>:<>
        <div className="trainer-contact-grid">
          <label className="field-label">Telegram<input type="url" value={trainerContacts.telegram} onChange={e=>setTrainerContacts(v=>({...v,telegram:e.target.value}))} placeholder="https://t.me/username"/></label>
          <label className="field-label">WhatsApp<input type="url" value={trainerContacts.whatsapp} onChange={e=>setTrainerContacts(v=>({...v,whatsapp:e.target.value}))} placeholder="https://wa.me/79990000000"/></label>
          <label className="field-label">MAX<input type="url" value={trainerContacts.max} onChange={e=>setTrainerContacts(v=>({...v,max:e.target.value}))} placeholder="https://max.ru/..."/></label>
          <label className="field-label">Телефон<input type="tel" value={trainerContacts.phone} onChange={e=>setTrainerContacts(v=>({...v,phone:e.target.value}))} placeholder="+7 999 000-00-00"/></label>
          <label className="field-label">Instagram<input type="url" value={trainerContacts.instagram} onChange={e=>setTrainerContacts(v=>({...v,instagram:e.target.value}))} placeholder="https://instagram.com/..."/></label>
          <label className="field-label">Сайт / страница<input type="url" value={trainerContacts.website} onChange={e=>setTrainerContacts(v=>({...v,website:e.target.value}))} placeholder="https://..."/></label>
        </div>
        <div className="profile-save-row"><button className="primary-button compact" disabled={trainerContactsSaving} onClick={()=>void saveTrainerContacts()}>{trainerContactsSaving?'Сохраняю…':'Сохранить контакты'}</button></div>
      </>}
    </section>}

    <section className="panel preference-panel">
      <div className="panel-head"><div><span className="eyebrow">Уведомления</span><h3>Напоминания внутри приложения</h3></div><Bell size={19}/></div>
      <p className="panel-description">Центр уведомлений ANDREWAY Fit работает уже сейчас. Telegram подключаем к той же системе постепенно, поэтому правила напоминаний и прямые ссылки не придётся создавать заново.</p>
      {!notificationsLoaded?<div className="library-empty">Не удалось загрузить настройки уведомлений.</div>:<div className="preference-row">
        <div className="preference-icon"><Bell size={17}/></div>
        <div><strong>Показывать напоминания</strong><span>Колокольчик и центр уведомлений. Список задач на сегодня остаётся частью плана.</span></div>
        <ToggleSwitch checked={notificationPrefs.in_app_enabled} disabled={notificationSaving} onChange={value=>void toggleInApp(value)} label="Уведомления внутри приложения"/>
      </div>}
    </section>

    <section className="panel preference-panel telegram-topic-settings">
      <div className="panel-head"><div><span className="eyebrow">Telegram</span><h3>Что присылать в бота</h3></div><MessageCircle size={19}/></div>
      <p className="panel-description">Эти переключатели уже сохраняются отдельно. Они начнут влиять на доставку после привязки Telegram-бота; уведомления внутри приложения настраиваются независимо.</p>
      {!telegramTopicsLoaded?<div className="library-empty">Не удалось загрузить категории Telegram.</div>:<div className="preference-list">
        {telegramTopicMeta.map(item=><div className="preference-row" key={item.code}>
          <div className="preference-icon"><MessageCircle size={17}/></div>
          <div><strong>{item.title}</strong><span>{item.description}</span></div>
          <ToggleSwitch checked={telegramTopics[item.code]} disabled={telegramTopicSaving.includes(item.code)} onChange={value=>void toggleTelegramTopic(item.code,value)} label={'Telegram: '+item.title}/>
        </div>)}
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
