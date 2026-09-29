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
import { NotificationsPage } from './pages/NotificationsPage'
import { PasswordResetPage } from './pages/PasswordResetPage'
import { MaterialsPage } from './pages/MaterialsPage'
import { supabase } from './lib/supabase'
import { getAppBaseUrl } from './lib/appUrl'
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
  const [authReady,setAuthReady]=useState(false)

  useEffect(() => {
    const client=supabase
    if (!client) {
      setAuthReady(true)
      return
    }

    let cancelled=false
    let unsubscribe:(()=>void)|undefined

    const bootstrap=async()=>{
      const {data}=await client.auth.getSession()
      if(cancelled)return

      if(data.session)await loadProfile(data.session.user.id)
      if(cancelled)return

      setAuthReady(true)

      const {data:listener}=client.auth.onAuthStateChange((_event,session)=>{
        if(cancelled)return
        if(session){
          void loadProfile(session.user.id).finally(()=>{
            if(!cancelled)setAuthReady(true)
          })
        }else{
          setState(initial)
          setAuthReady(true)
        }
      })
      unsubscribe=()=>listener.subscription.unsubscribe()
    }

    void bootstrap()
    return ()=>{
      cancelled=true
      unsubscribe?.()
    }
  }, [])

  useEffect(()=>{
    if(!authReady)return
    const frame=requestAnimationFrame(()=>document.documentElement.classList.add('app-ready'))
    return ()=>cancelAnimationFrame(frame)
  },[authReady])

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

    let inviteAccepted=false
    if (pendingInvite) {
      const { error } = await supabase.rpc('accept_client_invite',{p_token:pendingInvite})
      if (!error) {
        localStorage.removeItem('andrey-fit-pending-client-invite')
        inviteAccepted=true
      }
    }

    // Supabase email confirmation may return auth tokens in the URL fragment.
    // Once the session and invitation are processed, remove technical callback data
    // so the user lands on a clean Andrey Fit URL.
    const recoveryCallback =
      pageQuery.get('reset') === '1' ||
      window.location.hash.includes('type=recovery')
    const authCallbackInHash =
      window.location.hash.includes('access_token=') ||
      window.location.hash.includes('refresh_token=') ||
      window.location.hash.includes('error_code=') ||
      window.location.hash.includes('type=signup') ||
      recoveryCallback

    if (inviteAccepted || pendingTrainer || authCallbackInHash) {
      const targetHash=recoveryCallback?'#/reset-password':'#/'
      window.history.replaceState({},document.title,getAppBaseUrl()+targetHash)
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

  if (supabase && !authReady) return <div className="app-auth-loading">Загружаем личный кабинет…</div>
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
            : <DashboardPage name={state.name} enabledModules={state.enabledModules} preview={state.preview}/>}
        />

        <Route path="/nutrition" element={clientHas('nutrition') ? <NutritionPage preview={state.preview}/> : <Navigate to="/" replace/>}/>
        <Route path="/workouts" element={clientHas('training') ? <WorkoutsPage preview={state.preview}/> : <Navigate to="/" replace/>}/>
        <Route path="/progress" element={clientHas('progress') ? <ProgressPage preview={state.preview}/> : <Navigate to="/" replace/>}/>
        <Route path="/settings" element={<SettingsPage preview={state.preview} role={state.role}/>}/>
        <Route path="/notifications" element={<NotificationsPage preview={state.preview}/>}/>
        <Route path="/materials" element={<MaterialsPage/>}/>
        <Route path="/materials/:slug" element={<MaterialsPage/>}/>
        <Route path="/reset-password" element={<PasswordResetPage/>}/>

        <Route path="/clients" element={state.role === 'trainer' ? <AdminPage preview={state.preview}/> : <Navigate to="/" replace/>}/>
        <Route path="/clients/:clientId" element={state.role === 'trainer' ? <ClientWorkspacePage preview={state.preview}/> : <Navigate to="/" replace/>}/>
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
