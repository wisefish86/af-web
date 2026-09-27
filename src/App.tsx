import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { NutritionPage } from './pages/NutritionPage'
import { WorkoutsPage } from './pages/WorkoutsPage'
import { ProgressPage } from './pages/ProgressPage'
import { AdminPage } from './pages/AdminPage'
import { TrainerHomePage } from './pages/TrainerHomePage'
import { BuilderPage } from './pages/BuilderPage'
import { ExerciseLibraryPage } from './pages/ExerciseLibraryPage'
import { ProgramBuilderPage } from './pages/ProgramBuilderPage'
import { ClientWorkspacePage } from './pages/ClientWorkspacePage'
import { SettingsPage } from './pages/SettingsPage'
import { supabase } from './lib/supabase'
import type { UserRole } from './lib/types'

type AppState = {
  authenticated: boolean
  preview: boolean
  role: UserRole
  name: string
  enabledModules: string[]
}

const initial: AppState = {
  authenticated: false,
  preview: false,
  role: 'client',
  name: 'Сергей',
  enabledModules: [],
}

const previewClientModules = ['nutrition', 'training', 'progress', 'checkins', 'notifications']

export default function App() {
  const [state, setState] = useState<AppState>(initial)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({data}) => {
      if (data.session) loadProfile(data.session.user.id)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) loadProfile(session.user.id)
      else setState(initial)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  async function loadProfile(userId: string) {
    if (!supabase) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, role')
      .eq('id', userId)
      .maybeSingle()

    const role: UserRole = profile?.role === 'trainer' ? 'trainer' : 'client'
    let enabledModules: string[] = []

    if (role === 'client') {
      const today = new Date().toISOString().slice(0,10)
      const { data: modules } = await supabase
        .from('client_modules')
        .select('module_code, enabled, starts_at, ends_at')
        .eq('client_id', userId)

      enabledModules = (modules ?? [])
        .filter(item => item.enabled && item.starts_at <= today && (!item.ends_at || item.ends_at >= today))
        .map(item => item.module_code)
    }

    setState({
      authenticated: true,
      preview: false,
      role,
      name: profile?.display_name || 'Пользователь',
      enabledModules,
    })
  }

  function preview(role: UserRole) {
    setState({
      authenticated: true,
      preview: true,
      role,
      name: role === 'trainer' ? 'Андрей' : 'Сергей',
      enabledModules: role === 'client' ? previewClientModules : [],
    })
  }

  async function logout() {
    if (!state.preview && supabase) await supabase.auth.signOut()
    setState(initial)
  }

  if (!state.authenticated) return <LoginPage onPreview={preview} onAuthenticated={()=>{}} />

  const clientHas = (moduleCode: string) =>
    state.role === 'client' && state.enabledModules.includes(moduleCode)

  return (
    <Routes>
      <Route
        element={
          <AppShell
            role={state.role}
            name={state.name}
            preview={state.preview}
            enabledModules={state.enabledModules}
            onLogout={logout}
          />
        }
      >
        <Route
          path="/"
          element={state.role === 'trainer'
            ? <TrainerHomePage/>
            : <DashboardPage name={state.name} enabledModules={state.enabledModules}/>}
        />

        <Route path="/nutrition" element={clientHas('nutrition') ? <NutritionPage/> : <Navigate to="/" replace/>}/>
        <Route path="/workouts" element={clientHas('training') ? <WorkoutsPage/> : <Navigate to="/" replace/>}/>
        <Route path="/progress" element={clientHas('progress') ? <ProgressPage/> : <Navigate to="/" replace/>}/>
        <Route path="/settings" element={state.role === 'client' ? <SettingsPage/> : <Navigate to="/" replace/>}/>

        <Route path="/clients" element={state.role === 'trainer' ? <AdminPage/> : <Navigate to="/" replace/>}/>
        <Route path="/clients/:clientId" element={state.role === 'trainer' ? <ClientWorkspacePage/> : <Navigate to="/" replace/>}/>
        <Route path="/builder" element={state.role === 'trainer' ? <BuilderPage/> : <Navigate to="/" replace/>}/>
        <Route path="/builder/exercises" element={state.role === 'trainer' ? <ExerciseLibraryPage preview={state.preview}/> : <Navigate to="/" replace/>}/>
        <Route path="/builder/programs/new" element={state.role === 'trainer' ? <ProgramBuilderPage preview={state.preview}/> : <Navigate to="/" replace/>}/>

        <Route path="*" element={<Navigate to="/" replace/>}/>
      </Route>
    </Routes>
  )
}
