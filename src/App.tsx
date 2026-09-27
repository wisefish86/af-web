import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { NutritionPage } from './pages/NutritionPage'
import { WorkoutsPage } from './pages/WorkoutsPage'
import { ProgressPage } from './pages/ProgressPage'
import { AdminPage } from './pages/AdminPage'
import { supabase } from './lib/supabase'
import type { UserRole } from './lib/types'

type AppState = { authenticated: boolean; preview: boolean; role: UserRole; name: string }
const initial: AppState = { authenticated: false, preview: false, role: 'client', name: 'Сергей' }

export default function App() {
  const [state, setState] = useState<AppState>(initial)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({data}) => { if (data.session) loadProfile(data.session.user.id) })
    const { data } = supabase.auth.onAuthStateChange((_event, session) => { if (session) loadProfile(session.user.id); else setState(initial) })
    return () => data.subscription.unsubscribe()
  }, [])

  async function loadProfile(userId: string) {
    if (!supabase) return
    const { data } = await supabase.from('profiles').select('display_name, role').eq('id', userId).maybeSingle()
    setState({ authenticated: true, preview: false, role: data?.role === 'trainer' ? 'trainer' : 'client', name: data?.display_name || 'Пользователь' })
  }

  function preview(role: UserRole) { setState({ authenticated: true, preview: true, role, name: role === 'trainer' ? 'Андрей' : 'Сергей' }) }
  async function logout() { if (!state.preview && supabase) await supabase.auth.signOut(); setState(initial) }

  if (!state.authenticated) return <LoginPage onPreview={preview} onAuthenticated={()=>{}} />

  return <Routes>
    <Route element={<AppShell role={state.role} name={state.name} preview={state.preview} onLogout={logout}/> }>
      <Route path="/" element={<DashboardPage/>}/>
      <Route path="/nutrition" element={<NutritionPage/>}/>
      <Route path="/workouts" element={<WorkoutsPage/>}/>
      <Route path="/progress" element={<ProgressPage/>}/>
      <Route path="/clients" element={state.role === 'trainer' ? <AdminPage/> : <Navigate to="/" replace/>}/>
      <Route path="*" element={<Navigate to="/" replace/>}/>
    </Route>
  </Routes>
}
