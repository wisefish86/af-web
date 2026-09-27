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
import { ReplacementGroupsPage } from './pages/ReplacementGroupsPage'
import { ClientWorkspacePage } from './pages/ClientWorkspacePage'
import { SettingsPage } from './pages/SettingsPage'
import { InboxPage } from './pages/InboxPage'
import { NutritionBuilderPage } from './pages/NutritionBuilderPage'
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

    const hashQuery = window.location.hash.includes('?')
      ? new URLSearchParams(window.location.hash.split('?')[1] ?? '')
      : new URLSearchParams()
    const pageQuery = new URLSearchParams(window.location.search)
    const pendingInvite = localStorage.getItem('andrey-fit-pending-client-invite') || hashQuery.get('invite') || pageQuery.get('invite')
    const pendingTrainer = localStorage.getItem('andrey-fit-pending-trainer-bootstrap') === '1' || hashQuery.get('bootstrap') === '1' || pageQuery.get('bootstrap') === '1'

    if (pendingTrainer) {
      const { error } = await supabase.rpc('claim_initial_trainer')
      if (!error) localStorage.removeItem('andrey-fit-pending-trainer-bootstrap')
    }

    if (pendingInvite) {
      const { error } = await supabase.rpc('accept_client_invite',{p_token:pendingInvite})
      if (!error) localStorage.removeItem('andrey-fit-pending-client-invite')
    }

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

        <Route path="/nutrition" element={clientHas('nutrition') ? <NutritionPage preview={state.preview}/> : <Navigate to="/" replace/>}/>
        <Route path="/workouts" element={clientHas('training') ? <WorkoutsPage preview={state.preview}/> : <Navigate to="/" replace/>}/>
        <Route path="/progress" element={clientHas('progress') ? <ProgressPage/> : <Navigate to="/" replace/>}/>
        <Route path="/settings" element={<SettingsPage preview={state.preview} role={state.role}/>}/>

        <Route path="/clients" element={state.role === 'trainer' ? <AdminPage preview={state.preview}/> : <Navigate to="/" replace/>}/>
        <Route path="/clients/:clientId" element={state.role === 'trainer' ? <ClientWorkspacePage/> : <Navigate to="/" replace/>}/>
        <Route path="/builder" element={state.role === 'trainer' ? <BuilderPage/> : <Navigate to="/" replace/>}/>
        <Route path="/inbox" element={state.role === 'trainer' ? <InboxPage preview={state.preview}/> : <Navigate to="/" replace/>}/>
        <Route path="/builder/exercises" element={state.role === 'trainer' ? <ExerciseLibraryPage preview={state.preview}/> : <Navigate to="/" replace/>}/>
        <Route path="/builder/programs/new" element={state.role === 'trainer' ? <ProgramBuilderPage preview={state.preview}/> : <Navigate to="/" replace/>}/>
        <Route path="/builder/replacements" element={state.role === 'trainer' ? <ReplacementGroupsPage preview={state.preview}/> : <Navigate to="/" replace/>}/>
        <Route path="/builder/nutrition/new" element={state.role === 'trainer' ? <NutritionBuilderPage preview={state.preview}/> : <Navigate to="/" replace/>}/>

        <Route path="*" element={<Navigate to="/" replace/>}/>
      </Route>
    </Routes>
  )
}
