import { useEffect, useState } from 'react'
import { Activity, Apple, ChartNoAxesCombined, Dumbbell, Inbox, Layers3, LayoutDashboard, LogOut, Settings2, UsersRound, BookOpen, UserRound } from 'lucide-react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import type { UserRole } from '../lib/types'
import { InstallAppButton } from './InstallAppButton'
import { NotificationBell } from './NotificationBell'
import { AppToastHost } from './AppToastHost'
import { showAppToast } from '../lib/toast'
import { setMyTelegramNotificationsEnabled } from '../features/notifications/service'
import { RouteContentBoundary } from './RouteContentBoundary'
import { TrainerChatButton } from './TrainerChatButton'
import { UiNotice } from '../ui/primitives'
import { getTelegramUnsafeUser, requestTelegramWriteAccess, setupTelegramBackButton } from '../lib/telegram'

type Props = {
  role: UserRole
  name: string
  preview: boolean
  enabledModules: string[]
  onLogout: () => void
  telegramTestClient?: boolean
  telegramMode?: boolean
}

const trainerNav = [
  { to: '/', label: 'Главная', icon: LayoutDashboard },
  { to: '/clients', label: 'Клиенты', icon: UsersRound },
  { to: '/inbox', label: 'Входящие', icon: Inbox },
  { to: '/builder', label: 'Конструктор', icon: Layers3 },
]

export function AppShell({ role, name, preview, enabledModules, onLogout, telegramTestClient=false, telegramMode=false }: Props) {
  const location = useLocation()
  const navigate=useNavigate()
  const [online,setOnline]=useState(()=>typeof navigator==='undefined'||navigator.onLine)
  const [telegramWriteAllowed,setTelegramWriteAllowed]=useState(()=>getTelegramUnsafeUser()?.allows_write_to_pm===true)
  const [telegramWriteBusy,setTelegramWriteBusy]=useState(false)
  const [telegramWriteDismissed,setTelegramWriteDismissed]=useState(()=>localStorage.getItem('andrey-fit-telegram-write-dismissed')==='1')
  const materialsMode=location.pathname.startsWith('/materials')
  const visualQa=new URLSearchParams(window.location.search).get('visual')==='client'

  useEffect(()=>{
    if(!telegramMode)return
    const rootRoutes=new Set(['/','/nutrition','/workouts','/progress','/settings'])
    const visible=!rootRoutes.has(location.pathname)
    return setupTelegramBackButton(visible,()=>{
      const state=window.history.state as {idx?:number}|null
      if((state?.idx??0)>0)navigate(-1)
      else navigate('/')
    })
  },[telegramMode,location.pathname,navigate])

  async function enableTelegramNotifications(){
    if(telegramWriteBusy)return
    setTelegramWriteBusy(true)
    try{
      const granted=await requestTelegramWriteAccess()
      if(granted){
        setTelegramWriteAllowed(true)
        setTelegramWriteDismissed(false)
        localStorage.removeItem('andrey-fit-telegram-write-dismissed')
        try{await setMyTelegramNotificationsEnabled(true)}catch{}
        showAppToast('Уведомления Telegram включены.')
      }else{
        setTelegramWriteDismissed(true)
        localStorage.setItem('andrey-fit-telegram-write-dismissed','1')
        try{await setMyTelegramNotificationsEnabled(false)}catch{}
        showAppToast('Можно включить уведомления позже в Настройках.')
      }
    }finally{
      setTelegramWriteBusy(false)
    }
  }

  useEffect(()=>{
    const onOnline=()=>setOnline(true)
    const onOffline=()=>setOnline(false)
    window.addEventListener('online',onOnline)
    window.addEventListener('offline',onOffline)
    return()=>{window.removeEventListener('online',onOnline);window.removeEventListener('offline',onOffline)}
  },[])

  const clientNav = [
    { to: '/', label: 'Главная', icon: LayoutDashboard, show: true },
    { to: '/nutrition', label: 'Питание', icon: Apple, show: enabledModules.includes('nutrition') },
    { to: '/workouts', label: 'Тренировки', icon: Dumbbell, show: enabledModules.includes('training') },
    { to: '/progress', label: 'Прогресс', icon: ChartNoAxesCombined, show: enabledModules.includes('progress') },
  ].filter(item => item.show)

  const nav = role === 'trainer' ? trainerNav : clientNav
  const pwaVariant=role==='trainer'?'trainer':'client'
  const showNotifications=role==='trainer'||enabledModules.includes('notifications')
  const title =
    location.pathname.startsWith('/clients/') ? 'Настройка клиента'
    : location.pathname === '/builder/exercises' ? 'Библиотека упражнений'
    : location.pathname === '/builder/replacements' ? 'Группы замен'
    : location.pathname === '/builder/programs/new' ? 'Новая программа'
    : location.pathname === '/notifications' ? 'Уведомления'
    : location.pathname === '/materials' ? 'Материалы'
    : location.pathname === '/trainer' ? 'О тренере'
    : nav.find(item => item.to === location.pathname)?.label
    ?? (location.pathname === '/settings' ? 'Настройки' : 'Andrey-Fit')

  return (
    <div className={"app-layout"+(telegramMode?" telegram-client-layout":"")}>
      {!telegramMode&&<aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Activity size={22} /></div>
          <div><strong>Andrey-Fit</strong><small>{role === 'trainer' ? 'Кабинет тренера' : 'Сопровождение'}</small></div>
        </div>

        <nav className="sidebar-nav">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'}>
              <Icon size={20}/><span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <InstallAppButton variant={pwaVariant}/>
          <NavLink className="nav-button" to="/materials"><BookOpen size={19}/>Материалы</NavLink>
          {role==='client'&&<NavLink className="nav-button" to="/trainer"><UserRound size={19}/>О тренере</NavLink>}
          <NavLink className="nav-button" to="/settings">
            <Settings2 size={19}/>Настройки
          </NavLink>
          <button className="nav-button" onClick={onLogout}><LogOut size={19}/>Выйти</button>
        </div>
      </aside>}

      <main className={'main-area'+(materialsMode?' materials-mode':'')}>
        {!materialsMode&&<header className={"topbar"+(telegramMode?" telegram-topbar":"")}>
          <div>
            {!telegramMode&&<span className="eyebrow">{role === 'trainer' ? 'Кабинет тренера' : 'Личный кабинет'}</span>}
            <h1>{title}</h1>
          </div>
          <div className="topbar-actions">
            {role==='client'&&<TrainerChatButton preview={preview}/>}
            {showNotifications&&<NotificationBell preview={preview}/>}
            {!telegramMode&&<><InstallAppButton variant={pwaVariant}/>
              <div className="profile-pill">
                <div className="avatar">{name.slice(0,1)}</div>
                <div><strong>{name}</strong><small>{preview&&!visualQa ? 'Предпросмотр' : role === 'trainer' ? 'Тренер' : 'Клиент'}</small></div>
              </div>
            </>}
          </div>
        </header>}

        {preview && !visualQa && !materialsMode && <div className="preview-banner">Предпросмотр · изменения интерфейса сохраняются только в этом браузере</div>}
        {telegramTestClient&&!materialsMode&&<UiNotice tone="warning" className="owner-test-banner"><strong>Тестовый клиент · Андрей</strong></UiNotice>}
        {telegramMode&&role==='client'&&!telegramWriteAllowed&&!telegramWriteDismissed&&!materialsMode&&<UiNotice className="telegram-write-banner"><span>Разреши боту присылать напоминания и ответы тренера.</span><button type="button" disabled={telegramWriteBusy} onClick={()=>void enableTelegramNotifications()}>{telegramWriteBusy?'Открываем…':'Включить уведомления'}</button></UiNotice>}
        {!online&&!materialsMode&&<div className="offline-banner"><strong>Нет соединения с интернетом.</strong><span>Не закрывай приложение, пока сеть не восстановится. Неуспешные отправки можно повторить — защищённые действия не создадут дубль.</span></div>}
        <section className={'content'+(materialsMode?' materials-content':'')}><RouteContentBoundary resetKey={location.key}><Outlet /></RouteContentBoundary></section>
      </main>

      <AppToastHost/>

      <nav className={"mobile-nav"+(telegramMode?" telegram-mobile-nav":"")}>
        {nav.slice(0,4).map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'}>
            <Icon size={20}/><span>{label}</span>
          </NavLink>
        ))}
        <NavLink to="/settings"><Settings2 size={20}/><span>Настройки</span></NavLink>
      </nav>
    </div>
  )
}
