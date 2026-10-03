import { useEffect, useState } from 'react'
import { Activity, Apple, ChartNoAxesCombined, Dumbbell, Inbox, Layers3, LayoutDashboard, LogOut, Settings2, UsersRound, BookOpen, UserRound } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import type { UserRole } from '../lib/types'
import { InstallAppButton } from './InstallAppButton'
import { NotificationBell } from './NotificationBell'
import { AppToastHost } from './AppToastHost'
import { RouteContentBoundary } from './RouteContentBoundary'
import { TrainerChatButton } from './TrainerChatButton'

type Props = {
  role: UserRole
  name: string
  preview: boolean
  enabledModules: string[]
  onLogout: () => void
}

const trainerNav = [
  { to: '/', label: 'Главная', icon: LayoutDashboard },
  { to: '/clients', label: 'Клиенты', icon: UsersRound },
  { to: '/inbox', label: 'Входящие', icon: Inbox },
  { to: '/builder', label: 'Конструктор', icon: Layers3 },
]

export function AppShell({ role, name, preview, enabledModules, onLogout }: Props) {
  const location = useLocation()
  const [online,setOnline]=useState(()=>typeof navigator==='undefined'||navigator.onLine)
  const materialsMode=location.pathname.startsWith('/materials')

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
    ?? (location.pathname === '/settings' ? 'Настройки' : 'ANDREWAY Fit')

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Activity size={22} /></div>
          <div><strong>ANDREWAY Fit</strong><small>{role === 'trainer' ? 'Кабинет тренера' : 'Сопровождение'}</small></div>
        </div>

        <nav className="sidebar-nav">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'}>
              <Icon size={20}/><span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <InstallAppButton/>
          <NavLink className="nav-button" to="/materials"><BookOpen size={19}/>Материалы</NavLink>
          {role==='client'&&<NavLink className="nav-button" to="/trainer"><UserRound size={19}/>О тренере</NavLink>}
          <NavLink className="nav-button" to="/settings">
            <Settings2 size={19}/>Настройки
          </NavLink>
          <button className="nav-button" onClick={onLogout}><LogOut size={19}/>Выйти</button>
        </div>
      </aside>

      <main className={'main-area'+(materialsMode?' materials-mode':'')}>
        {!materialsMode&&<header className="topbar">
          <div>
            <span className="eyebrow">{role === 'trainer' ? 'Кабинет тренера' : 'Личный кабинет'}</span>
            <h1>{title}</h1>
          </div>
          <div className="topbar-actions">
            {role==='client'&&<TrainerChatButton preview={preview}/>}
            {showNotifications&&<NotificationBell preview={preview}/>} 
            <InstallAppButton/>
            <div className="profile-pill">
            <div className="avatar">{name.slice(0,1)}</div>
            <div><strong>{name}</strong><small>{preview ? 'Предпросмотр' : role === 'trainer' ? 'Тренер' : 'Клиент'}</small></div>
            </div>
          </div>
        </header>}

        {preview && !materialsMode && <div className="preview-banner">Предпросмотр · изменения интерфейса сохраняются только в этом браузере</div>}
        {!online&&!materialsMode&&<div className="offline-banner"><strong>Нет соединения с интернетом.</strong><span>Не закрывай приложение, пока сеть не восстановится. Неуспешные отправки можно повторить — защищённые действия не создадут дубль.</span></div>}
        <section className={'content'+(materialsMode?' materials-content':'')}><RouteContentBoundary resetKey={location.key}><Outlet /></RouteContentBoundary></section>
      </main>

      <AppToastHost/>

      <nav className="mobile-nav">
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
