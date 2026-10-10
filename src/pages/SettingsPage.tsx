import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, Check, Eye, EyeOff, KeyRound, MailCheck, MessageCircle, ShieldCheck, UserRound } from 'lucide-react'
import { ToggleSwitch } from '../components/ToggleSwitch'
import { PwaInstallPanel } from '../components/PwaInstallPanel'
import { loadMyProfile, loadTrainerSecurityInfo, saveMyBodyProfile, saveMyProfile, sendMyTrainerPasswordRecovery, type TrainerSecurityInfo } from '../features/profile/service'
import { neutralAvatars, type ClientProfile } from '../features/profile/types'
import { defaultNotificationTopicPreferences, loadNotificationPreferences, loadNotificationTopicPreferences, saveNotificationPreferences, saveNotificationTopicPreference, type NotificationPreferences, type NotificationTopicCode, type NotificationTopicPreferences } from '../features/notifications/service'
import { loadMyTrackingSetup, setMyTrackingPreference, type TrackingFieldState } from '../features/tracking/service'
import type { UserRole } from '../lib/types'
import { setAppTimeZone } from '../lib/appDate'
import { showAppToast } from '../lib/toast'
import { UiCard, UiLoadError, UiNotice, UiSectionHeader, UiStack } from '../ui/primitives'
import { contactSettingsFromRows, emptyTrainerContactSettings, loadMyTrainerContactSettings, saveMyTrainerContactSettings, type TrainerContactSettings } from '../features/contacts/service'
import { emptyTrainerPublicProfileDraft, loadMyTrainerPublicProfileDraft, saveMyTrainerPublicProfileDraft, type TrainerPublicProfileDraft } from '../features/trainerProfile/service'
import { createMyTelegramLink, loadMyTelegramConnection } from '../features/telegram/service'

type Props={preview:boolean;role:UserRole}
const previewNotificationPreferences:NotificationPreferences={
  user_id:'preview',in_app_enabled:true,telegram_enabled:false,web_push_enabled:false,
  quiet_hours_enabled:true,quiet_start:'22:00:00',quiet_end:'08:00:00',
  timezone:'Europe/Moscow',digest_mode:'immediate',
}
function makePreviewProfile(role:UserRole):ClientProfile{
  return role==='trainer'
    ? {id:'preview-trainer',display_name:'Андрей',login_alias:null,nickname:'Тренер',age:null,city:null,timezone:'Europe/Moscow',avatar_key:'owl',height_cm:null,wrist_cm:null,ankle_cm:null}
    : {id:'preview',display_name:'Сергей',login_alias:null,nickname:'Музыкант',age:37,city:null,timezone:'Europe/Moscow',avatar_key:'fox',height_cm:178,wrist_cm:18,ankle_cm:null}
}
const previewTracking:TrackingFieldState[]=[
  ['hunger','daily','Голод'],['energy','daily','Энергия'],['stress','daily','Стресс'],
  ['sleep','daily','Сон'],['ease','daily','Насколько легко соблюдать питание'],
  ['waist','measurements','Талия'],['chest','measurements','Грудь'],['hips','measurements','Таз'],
  ['thigh','measurements','Бедро'],['arm_relaxed','measurements','Рука расслаблена'],['arm_flexed','measurements','Рука напряжена'],
  ['appearance','monthly','Внешний вид'],['fitness','monthly','Форма'],['physical_comfort','monthly','Физический комфорт'],
  ['sleep_recovery','monthly','Сон и восстановление'],['nutrition','monthly','Питание'],
].map(([code,section,label])=>({code,section,label,unit:null,enabled:true,required:false,frequency:null,client_can_disable:true,hidden:false,reminder_enabled:true,settings:{}}))

function normalizedPhone(value:string){
  const digits=value.replace(/\D/g,'')
  if(digits.length===11&&digits.startsWith('8'))return '7'+digits.slice(1)
  return digits
}
function sameTrainerContacts(actual:TrainerContactSettings,expected:TrainerContactSettings){
  return (['telegram','whatsapp','max','instagram','website'] as const).every(key=>actual[key].trim()===expected[key].trim())
    && normalizedPhone(actual.phone)===normalizedPhone(expected.phone)
}
function sameTrainerPublicProfile(actual:TrainerPublicProfileDraft,expected:TrainerPublicProfileDraft){
  return actual.is_published===expected.is_published
    && (['headline','welcome_message','about_text','experience_text','approach_text','specialties_text','education_text'] as const)
      .every(key=>actual[key].trim()===expected[key].trim())
}
function sameProfileBase(actual:ClientProfile,expected:ClientProfile){
  return actual.display_name.trim()===expected.display_name.trim()
    && (actual.nickname??'').trim()===(expected.nickname??'').trim()
    && actual.age===expected.age
    && (actual.city??'').trim()===(expected.city??'').trim()
    && actual.timezone===expected.timezone
    && (actual.avatar_key??null)===(expected.avatar_key??null)
}
function sameProfileBody(actual:ClientProfile,expected:ClientProfile){
  return actual.height_cm===expected.height_cm
    && actual.wrist_cm===expected.wrist_cm
    && actual.ankle_cm===expected.ankle_cm
}

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
  const [telegramConnected,setTelegramConnected]=useState<boolean|null>(preview&&role==='client'?false:null)
  const [telegramConnectionBusy,setTelegramConnectionBusy]=useState(false)
  const [telegramConnectLinks,setTelegramConnectLinks]=useState<{webUrl:string}|null>(null)
  const [reloadKey,setReloadKey]=useState(0)
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
    setLoading(true)
    setNotice('')
    Promise.allSettled([
      loadMyProfile(),
      loadNotificationPreferences(),
      loadNotificationTopicPreferences('telegram'),
      role==='client'?loadMyTrackingSetup():Promise.resolve([] as TrackingFieldState[]),
    ]).then(([profileResult,notificationResult,telegramTopicResult,trackingResult])=>{
      const failed:string[]=[]
      if(profileResult.status==='fulfilled'){
        setProfile(profileResult.value);setProfileLoaded(true)
        if(role==='client'){
          void loadMyTelegramConnection(profileResult.value.id)
            .then(setTelegramConnected)
            .catch(()=>{setTelegramConnected(null);setNotice(current=>current?current+' Не удалось проверить подключение Telegram.':'Не удалось проверить подключение Telegram.')})
        }
      } else {setProfileLoaded(false);failed.push('профиль')}
      if(notificationResult.status==='fulfilled'){setNotificationPrefs(notificationResult.value);setNotificationsLoaded(true)}
      else {setNotificationsLoaded(false);failed.push('уведомления')}
      if(telegramTopicResult.status==='fulfilled'){setTelegramTopics(telegramTopicResult.value);setTelegramTopicsLoaded(true)}
      else {setTelegramTopicsLoaded(false);failed.push('категории Telegram')}
      if(trackingResult.status==='fulfilled'){setTracking(trackingResult.value);setTrackingLoaded(true)}
      else {setTrackingLoaded(false);failed.push('персонализация полей')}
      setNotice(failed.length?'Часть настроек не загрузилась: '+failed.join(', ')+'. Доступные разделы можно использовать.':'')
    }).finally(()=>setLoading(false))
  },[preview,role,reloadKey])

  useEffect(()=>{
    if(role!=='trainer')return
    if(preview){
      setTrainerContacts({
        telegram:'https://t.me/example',
        whatsapp:'https://wa.me/10000000000',
        max:'https://max.ru/example',
        phone:'+10000000000',
        instagram:'https://instagram.com/example',
        website:'https://example.com',
      })
      setTrainerPublicProfile({
        headline:'Тренер Andrey-Fit',
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
  },[preview,role,reloadKey])

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
    }catch(e){
      if(!preview){
        try{
          const actual=contactSettingsFromRows(await loadMyTrainerContactSettings())
          if(sameTrainerContacts(actual,trainerContacts)){
            setTrainerContacts(actual)
            showAppToast('Контакты уже были сохранены на сервере.','info')
            return
          }
        }catch{}
      }
      setNotice(e instanceof Error?e.message:'Не удалось сохранить контакты')
    }
    finally{setTrainerContactsSaving(false)}
  }

  async function saveTrainerPublicProfile(){
    if(role!=='trainer'||trainerPublicProfileSaving)return
    setTrainerPublicProfileSaving(true);setNotice('')
    try{
      if(!preview)await saveMyTrainerPublicProfileDraft(trainerPublicProfile)
      showAppToast('Публичная страница тренера сохранена.')
    }catch(e){
      if(!preview){
        try{
          const actual=await loadMyTrainerPublicProfileDraft()
          if(sameTrainerPublicProfile(actual,trainerPublicProfile)){
            setTrainerPublicProfile(actual)
            showAppToast('Публичная страница уже была сохранена на сервере.','info')
            return
          }
        }catch{}
      }
      setNotice(e instanceof Error?e.message:'Не удалось сохранить публичную страницу')
    }
    finally{setTrainerPublicProfileSaving(false)}
  }

  async function saveProfile(){
    if(!profileLoaded){setNotice('Профиль не загрузился. Сохранение временно отключено.');return}
    if(!profile.display_name.trim()){setNotice('Укажи имя.');return}
    if(role==='client'&&profile.age!=null&&(!Number.isInteger(profile.age)||profile.age<13||profile.age>100)){setNotice('Возраст должен быть от 13 до 100 лет.');return}
    if(role==='client'&&profile.height_cm!=null&&(profile.height_cm<100||profile.height_cm>250)){setNotice('Рост должен быть от 100 до 250 см.');return}
    if(role==='client'&&profile.wrist_cm!=null&&(profile.wrist_cm<10||profile.wrist_cm>30)){setNotice('Обхват запястья должен быть от 10 до 30 см.');return}
    setSaving(true);setNotice('')
    try{
      if(!preview){
        await saveMyProfile(profile)
        if(role==='client')await saveMyBodyProfile({height_cm:profile.height_cm,wrist_cm:profile.wrist_cm,ankle_cm:profile.ankle_cm})
      }
      setAppTimeZone(profile.timezone)
      setNotificationPrefs(current=>({...current,timezone:profile.timezone}))
      window.dispatchEvent(new CustomEvent('andrey-fit-profile-name-changed',{detail:{name:profile.display_name.trim()}}))
      showAppToast('Профиль сохранён.')
    }catch(e){
      if(!preview){
        try{
          const actual=await loadMyProfile()
          const baseSaved=sameProfileBase(actual,profile)
          const bodySaved=role!=='client'||sameProfileBody(actual,profile)
          if(baseSaved&&bodySaved){
            setProfile(actual)
            setAppTimeZone(actual.timezone)
            setNotificationPrefs(current=>({...current,timezone:actual.timezone}))
            window.dispatchEvent(new CustomEvent('andrey-fit-profile-name-changed',{detail:{name:actual.display_name.trim()}}))
            showAppToast('Профиль уже был сохранён на сервере.','info')
            return
          }
          if(baseSaved||bodySaved){
            setNotice('Часть профиля уже сохранена, но не все поля подтверждены сервером. Повторное сохранение безопасно.')
            return
          }
        }catch{}
      }
      setNotice((e instanceof Error?e.message:'Не удалось сохранить профиль')+' Повторное сохранение безопасно.')
    }
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
      try{
        const actual=await loadMyTrackingSetup()
        const savedField=actual.find(item=>item.code===field.code)
        if(savedField?.hidden===hidden){
          setTracking(actual)
          return
        }
      }catch{}
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
      try{
        const actual=await loadNotificationPreferences()
        if(actual.in_app_enabled===value){
          setNotificationPrefs(actual)
          return
        }
      }catch{}
      setNotificationPrefs(previous)
      setNotice(e instanceof Error?e.message:'Не удалось изменить уведомления')
    }finally{setNotificationSaving(false)}
  }

  async function refreshTelegramConnection(){
    if(role!=='client'||!profileLoaded||telegramConnectionBusy)return
    setTelegramConnectionBusy(true)
    try{
      const connected=preview?false:await loadMyTelegramConnection(profile.id)
      setTelegramConnected(connected)
      if(connected){
        const actual=preview?notificationPrefs:await loadNotificationPreferences()
        setNotificationPrefs(actual)
      }
    }catch(e){
      setTelegramConnected(null)
      setNotice(e instanceof Error?e.message:'Не удалось проверить подключение Telegram.')
    }finally{setTelegramConnectionBusy(false)}
  }

  async function prepareTelegramConnection(){
    if(role!=='client'||!profileLoaded||telegramConnectionBusy||telegramConnected!==false||telegramConnectLinks)return
    if(preview)return
    setTelegramConnectionBusy(true)
    try{
      const links=await createMyTelegramLink(profile.id)
      setTelegramConnectLinks(links)
    }catch(e){
      setNotice(e instanceof Error?e.message:'Не удалось подготовить подключение Telegram.')
    }finally{setTelegramConnectionBusy(false)}
  }

  async function toggleTelegramNotifications(value:boolean){
    if(!telegramConnected||!notificationsLoaded||notificationSaving)return
    const previous=notificationPrefs
    const next={...notificationPrefs,telegram_enabled:value,timezone:profile.timezone}
    setNotificationPrefs(next);setNotificationSaving(true)
    if(preview){setNotificationSaving(false);return}
    try{await saveNotificationPreferences(next)}
    catch(e){
      setNotificationPrefs(previous)
      setNotice(e instanceof Error?e.message:'Не удалось изменить Telegram-уведомления')
    }finally{setNotificationSaving(false)}
  }

  useEffect(()=>{
    if(preview||role!=='client'||telegramConnected===true)return
    const onVisible=()=>{if(document.visibilityState==='visible')void refreshTelegramConnection()}
    document.addEventListener('visibilitychange',onVisible)
    window.addEventListener('focus',onVisible)
    return()=>{document.removeEventListener('visibilitychange',onVisible);window.removeEventListener('focus',onVisible)}
  },[preview,role,profile.id,profileLoaded,telegramConnected])

  useEffect(()=>{
    if(preview||role!=='client'||telegramConnected!==false||telegramConnectLinks||telegramConnectionBusy)return
    void prepareTelegramConnection()
  },[preview,role,profile.id,profileLoaded,telegramConnected,telegramConnectLinks,telegramConnectionBusy])

  async function toggleTelegramTopic(topic:NotificationTopicCode,value:boolean){
    if(!telegramTopicsLoaded||telegramTopicSaving.includes(topic))return
    const previous=telegramTopics[topic]
    setTelegramTopics(current=>({...current,[topic]:value}))
    setTelegramTopicSaving(current=>[...current,topic])
    if(preview){setTelegramTopicSaving(current=>current.filter(x=>x!==topic));return}
    try{await saveNotificationTopicPreference(topic,value,'telegram')}
    catch(e){
      try{
        const actual=await loadNotificationTopicPreferences('telegram')
        if(actual[topic]===value){
          setTelegramTopics(actual)
          return
        }
      }catch{}
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

  const initialLoadIncomplete=!loading&&(!profileLoaded||!notificationsLoaded||!telegramTopicsLoaded||!trackingLoaded||(role==='trainer'&&(!trainerContactsLoaded||!trainerPublicProfileLoaded||!trainerSecurityLoaded)))
  const optionalTracking=tracking.filter(f=>f.enabled&&f.client_can_disable&&!f.required&&!['calories','protein','steps','trained'].includes(f.code))
  const groups=[
    {section:'daily',title:'Ежедневные вопросы',description:'Короткое самочувствие. Отключённые вопросы исчезнут с главной.'},
    {section:'measurements',title:'Замеры',description:'Вес остаётся базовым показателем; остальные замеры можно скрыть.'},
    {section:'monthly',title:'Контрольная самооценка',description:'Оставь только те оценки, которые реально полезны тебе и тренеру. Раз в 30 дней — рекомендация, пройти можно раньше.'},
  ]

  return <UiStack className="settings-page">
    {role==='trainer'&&<section className="section-intro settings-hero">
      <div><span className="eyebrow">Мой кабинет</span><h2>Профиль и настройки</h2><p>Профиль тренера и общие настройки кабинета.</p></div>
      <div className="calm-badge"><ShieldCheck size={18}/><span>Минимум лишних данных</span></div>
    </section>}

    {initialLoadIncomplete?<UiLoadError message={notice||'Часть настроек не загрузилась.'} hint="Доступные разделы можно использовать, а недостающие данные загрузить повторно." onRetry={()=>setReloadKey(value=>value+1)} retryLabel="Повторить загрузку"/>:notice&&<UiNotice tone="warning">{notice}</UiNotice>}

    <UiCard className="profile-settings-panel">
      <UiSectionHeader kicker="Профиль" title={role==='client'?'Профиль и исходные данные':'Как тебя показывать'} icon={<UserRound size={19}/>}/>
      {loading?<div className="library-empty">Загружаю профиль…</div>:!profileLoaded?<div className="library-empty">Не удалось загрузить профиль. Поля не показаны, чтобы не подменять реальные данные значениями по умолчанию.</div>:<>
        <div className="profile-avatar-picker">{neutralAvatars.map(a=><button key={a.key} className={profile.avatar_key===a.key?'is-active':''} onClick={()=>setProfile(p=>({...p,avatar_key:a.key}))} title={a.label}><span>{a.emoji}</span>{profile.avatar_key===a.key&&<Check size={12}/>}</button>)}</div>
        <div className="form-grid-3 profile-form-grid">
          <label className="field-label">Имя / как обращаться<input value={profile.display_name} maxLength={60} onChange={e=>setProfile(p=>({...p,display_name:e.target.value}))}/></label>
          <label className="field-label">Никнейм / метка<input value={profile.nickname??''} maxLength={40} onChange={e=>setProfile(p=>({...p,nickname:e.target.value||null}))} placeholder={role==='trainer'?'Например: Андрей':'Например: Музыкант'}/></label>
          {role==='client'&&<label className="field-label">Возраст<input type="number" min="13" max="100" value={profile.age??''} onChange={e=>setProfile(p=>({...p,age:e.target.value===''?null:Number(e.target.value)}))}/></label>}
          {role==='client'&&<label className="field-label">Рост, см <small>используется в расчётах</small><input inputMode="decimal" value={profile.height_cm??''} onChange={e=>setProfile(p=>({...p,height_cm:e.target.value===''?null:Number(e.target.value.replace(',','.'))}))} placeholder="Например, 178"/></label>}
          {role==='client'&&<label className="field-label">Запястье, см <small>необязательно</small><input inputMode="decimal" value={profile.wrist_cm??''} onChange={e=>setProfile(p=>({...p,wrist_cm:e.target.value===''?null:Number(e.target.value.replace(',','.'))}))} placeholder="Например, 18"/></label>}
          <label className="field-label">Город <small>необязательно</small><input value={profile.city??''} maxLength={80} onChange={e=>setProfile(p=>({...p,city:e.target.value||null}))} placeholder="Можно не указывать"/></label>
          <label className="field-label">Часовой пояс<select value={profile.timezone} onChange={e=>setProfile(p=>({...p,timezone:e.target.value}))}><option value="Europe/Moscow">Москва (UTC+3)</option><option value="Europe/Kaliningrad">Калининград (UTC+2)</option><option value="Asia/Yekaterinburg">Екатеринбург (UTC+5)</option><option value="Asia/Novosibirsk">Новосибирск (UTC+7)</option><option value="Asia/Vladivostok">Владивосток (UTC+10)</option></select></label>
        </div>
        <div className="profile-save-row"><button className="primary-button compact" disabled={saving} onClick={()=>void saveProfile()}>{saving?'Сохраняю…':'Сохранить профиль'}</button></div>
      </>}
    </UiCard>

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

    <PwaInstallPanel variant={role==='trainer'?'trainer':'client'}/>

    {role==='trainer'&&<section className="panel trainer-contact-settings">
      <div className="panel-head"><div><span className="eyebrow">Связь с клиентом</span><h3>Контакты и соцсети</h3></div><MessageCircle size={19}/></div>
      <p className="panel-description">Мессенджеры попадут в кнопку «Чат с тренером». Телефон, Instagram и сайт будут доступны на странице «О тренере».</p>
      {!trainerContactsLoaded?<div className="library-empty">Не удалось загрузить контакты.</div>:<>
        <div className="trainer-contact-grid">
          <label className="field-label">Telegram<input type="url" value={trainerContacts.telegram} onChange={e=>setTrainerContacts(v=>({...v,telegram:e.target.value}))} placeholder="https://t.me/username"/></label>
          <label className="field-label">WhatsApp<input type="url" value={trainerContacts.whatsapp} onChange={e=>setTrainerContacts(v=>({...v,whatsapp:e.target.value}))} placeholder="https://wa.me/10000000000"/></label>
          <label className="field-label">MAX<input type="url" value={trainerContacts.max} onChange={e=>setTrainerContacts(v=>({...v,max:e.target.value}))} placeholder="https://max.ru/..."/></label>
          <label className="field-label">Телефон<input type="tel" value={trainerContacts.phone} onChange={e=>setTrainerContacts(v=>({...v,phone:e.target.value}))} placeholder="+7 999 000-00-00"/></label>
          <label className="field-label">Instagram<input type="url" value={trainerContacts.instagram} onChange={e=>setTrainerContacts(v=>({...v,instagram:e.target.value}))} placeholder="https://instagram.com/..."/></label>
          <label className="field-label">Сайт / страница<input type="url" value={trainerContacts.website} onChange={e=>setTrainerContacts(v=>({...v,website:e.target.value}))} placeholder="https://..."/></label>
        </div>
        <div className="profile-save-row"><button className="primary-button compact" disabled={trainerContactsSaving} onClick={()=>void saveTrainerContacts()}>{trainerContactsSaving?'Сохраняю…':'Сохранить контакты'}</button></div>
      </>}
    </section>}

    <UiCard className="preference-panel">
      <UiSectionHeader kicker="Уведомления" title="Напоминания внутри приложения" icon={<Bell size={19}/>}/>
      <p className="panel-description">Центр уведомлений Andrey-Fit работает уже сейчас. Telegram подключаем к той же системе постепенно, поэтому правила напоминаний и прямые ссылки не придётся создавать заново.</p>
      {!notificationsLoaded?<div className="library-empty">Не удалось загрузить настройки уведомлений.</div>:<div className="preference-row">
        <div className="preference-icon"><Bell size={17}/></div>
        <div><strong>Показывать напоминания</strong><span>Колокольчик и центр уведомлений. Список задач на сегодня остаётся частью плана.</span></div>
        <ToggleSwitch checked={notificationPrefs.in_app_enabled} disabled={notificationSaving} onChange={value=>void toggleInApp(value)} label="Уведомления внутри приложения"/>
      </div>}
    </UiCard>

    {role==='client'&&<UiCard className="preference-panel telegram-access-settings">
      <UiSectionHeader kicker="Telegram" title="Telegram-бот" icon={<MessageCircle size={19}/>}/>
      <p className="panel-description">Подключи свой Telegram к этому профилю Andrey-Fit. Mini App не используется: бот нужен только для уведомлений и быстрых переходов.</p>
      <div className="preference-row">
        <div className="preference-icon"><MessageCircle size={17}/></div>
        <div>
          <strong>{telegramConnected===true?'Telegram подключён':telegramConnected===false?'Telegram не подключён':'Статус Telegram не определён'}</strong>
          <span>{telegramConnected===true
            ?(notificationPrefs.telegram_enabled?'Бот может присылать выбранные уведомления.':'Telegram связан с профилем, но отправка уведомлений выключена.')
            :telegramConnected===false?'Подключение займёт один переход в бота.':'Нажми «Проверить», чтобы обновить статус.'}</span>
        </div>
        {telegramConnected===true
          ?<ToggleSwitch checked={notificationPrefs.telegram_enabled} disabled={notificationSaving} onChange={value=>void toggleTelegramNotifications(value)} label="Получать уведомления в Telegram"/>
          :telegramConnected===null
            ?<button className="ghost-button compact" disabled={telegramConnectionBusy} onClick={()=>void refreshTelegramConnection()}>{telegramConnectionBusy?'Проверяю…':'Проверить'}</button>
            :telegramConnectLinks
              ?<a className="ghost-button compact" href={telegramConnectLinks.webUrl} target="_blank" rel="noopener noreferrer">Подключить Telegram</a>
              :<button className="ghost-button compact" disabled>{telegramConnectionBusy?'Готовим Telegram…':'Подготовка…'}</button>}
      </div>
      {telegramConnected===false&&telegramConnectLinks&&<div className="drawer-notice">
        Один тап откроет стандартную Telegram-ссылку с уже вложенным одноразовым кодом подключения. Ссылка действует 15 минут.
      </div>}
    </UiCard>}

    {role==='client'&&<UiCard className="preference-panel telegram-topic-settings">
      <UiSectionHeader kicker="Telegram" title="Что присылать в бота" icon={<MessageCircle size={19}/>}/>
      <p className="panel-description">{telegramConnected===true?'Выбери категории Telegram-уведомлений. Уведомления внутри приложения настраиваются независимо.':'Сначала подключи Telegram к этому профилю — после этого можно выбрать категории сообщений.'}</p>
      {telegramConnected!==true
        ?<UiNotice>Telegram пока не подключён. Категории сохранены, но доставка в бот не работает.</UiNotice>
        :!telegramTopicsLoaded?<div className="library-empty">Не удалось загрузить категории Telegram.</div>:<div className="preference-list">
        {telegramTopicMeta.map(item=><div className="preference-row" key={item.code}>
          <div className="preference-icon"><MessageCircle size={17}/></div>
          <div><strong>{item.title}</strong><span>{item.description}</span></div>
          <ToggleSwitch checked={telegramTopics[item.code]} disabled={telegramTopicSaving.includes(item.code)||!notificationPrefs.telegram_enabled} onChange={value=>void toggleTelegramTopic(item.code,value)} label={'Telegram: '+item.title}/>
        </div>)}
      </div>}
    </UiCard>}

    {role==='client'&&trackingLoaded&&groups.map(group=>{
      const fields=optionalTracking.filter(f=>f.section===group.section)
      if(!fields.length)return null
      return <UiCard className="preference-panel" key={group.section}>
        <UiSectionHeader kicker="Персонализация" title={group.title} icon={<Eye size={19}/>}/>
        <p className="panel-description">{group.description}</p>
        <div className="preference-list">{fields.map(field=><div className="preference-row" key={field.code}>
          <div className="preference-icon">{field.hidden?<EyeOff size={17}/>:<Eye size={17}/>}</div>
          <div><strong>{field.label}</strong><span>{field.hidden?'Скрыто из форм':'Показывается в формах'}</span></div>
          <ToggleSwitch checked={!field.hidden} disabled={trackingSavingCodes.includes(field.code)} onChange={()=>void toggleTracking(field)} label={'Показывать '+field.label}/>
        </div>)}</div>
      </UiCard>
    })}
  </UiStack>
}
