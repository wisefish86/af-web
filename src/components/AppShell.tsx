import { Activity, Apple, ChartNoAxesCombined, Dumbbell, LayoutDashboard, LogOut, Settings2, UsersRound } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import type { UserRole } from '../lib/types'

type Props = { role: UserRole; name: string; preview: boolean; onLogout: () => void }

const clientNav = [
  { to: '/', label: 'Главная', icon: LayoutDashboard },
  { to: '/nutrition', label: 'Питание', icon: Apple },
  { to: '/workouts', label: 'Тренировки', icon: Dumbbell },
  { to: '/progress', label: 'Прогресс', icon: ChartNoAxesCombined },
]
const trainerNav = [...clientNav, { to: '/clients', label: 'Клиенты', icon: UsersRound }]

export function AppShell({ role, name, preview, onLogout }: Props) {
  const location = useLocation()
  const nav = role === 'trainer' ? trainerNav : clientNav
  const title = nav.find((item) => item.to === location.pathname)?.label ?? 'Andrey Fitness'

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><Activity size={22} /></div><div><strong>Andrey Fitness</strong><small>coach platform</small></div></div>
        <nav className="sidebar-nav">
          {nav.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'}><Icon size={20}/><span>{label}</span></NavLink>)}
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-button"><Settings2 size={19}/>Настройки</button>
          <button className="nav-button" onClick={onLogout}><LogOut size={19}/>Выйти</button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div><span className="eyebrow">{role === 'trainer' ? 'Кабинет тренера' : 'Личный кабинет'}</span><h1>{title}</h1></div>
          <div className="profile-pill"><div className="avatar">{name.slice(0,1)}</div><div><strong>{name}</strong><small>{preview ? 'Предпросмотр' : role === 'trainer' ? 'Тренер' : 'Клиент'}</small></div></div>
        </header>
        {preview && <div className="preview-banner">Режим предпросмотра · данные тестовые и не записываются в Supabase</div>}
        <section className="content"><Outlet /></section>
      </main>

      <nav className="mobile-nav">
        {nav.slice(0,5).map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'}><Icon size={20}/><span>{label}</span></NavLink>)}
      </nav>
    </div>
  )
}
